import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ReconcileBatchHandler } from '../../application/commands/handlers/reconcile-batch.handler';
import { ReconcileBatchCommand } from '../../application/commands/impl/reconcile-batch.command';
import { ReconcileRequestDto } from '../../application/dto/reconcile-request.dto';
import {
  UploadResponseDto,
  JobStatusResponseDto,
} from '../../application/dto/dashboard-stats-response.dto';
import { GetUser } from '../../../auth/decorators/get-user.decorator';
import { RECONCILIATION_QUEUE } from '../../../../shared/queue/queue.constants';

const UPLOAD_DIR = '/tmp/uploads';

const multerStorage = diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

@Controller('reconciliations')
export class ReconciliationController {
  private readonly logger = new Logger(ReconciliationController.name);

  constructor(
    private readonly handler: ReconcileBatchHandler,
    @InjectQueue(RECONCILIATION_QUEUE) private readonly queue: Queue,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multerStorage,
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
      fileFilter: (_req, file, cb) => {
        const allowed = ['.csv', '.xlsx'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowed.includes(ext)) {
          cb(
            new BadRequestException(
              `Unsupported file type: ${ext}. Allowed: ${allowed.join(', ')}`,
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ReconcileRequestDto,
    @GetUser('id') userId: string,
  ): Promise<UploadResponseDto> {
    if (!file) {
      throw new BadRequestException('A file must be provided');
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const fileType: 'csv' | 'xlsx' = ext === '.csv' ? 'csv' : 'xlsx';

    this.logger.log(
      `Upload received: ${file.originalname} (${file.size} bytes) by user ${userId}`,
    );

    const command = new ReconcileBatchCommand(file.path, fileType, userId);
    const { jobId } = await this.handler.execute(command);

    return {
      jobId,
      status: 'queued',
      message: `File "${file.originalname}" queued for processing. Track progress using jobId.`,
    };
  }

  @Get(':jobId/status')
  async getJobStatus(
    @Param('jobId') jobId: string,
  ): Promise<JobStatusResponseDto> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      throw new NotFoundException(`Job with id "${jobId}" not found`);
    }

    const state = await job.getState();

    return {
      jobId,
      state,
      progress: job.progress,
      failedReason: job.failedReason,
      processedOn: job.processedOn ?? undefined,
      finishedOn: job.finishedOn ?? undefined,
    };
  }
}
