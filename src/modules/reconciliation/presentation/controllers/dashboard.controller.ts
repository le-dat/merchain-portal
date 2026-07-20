import { All, Controller, Next, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Router } from 'express';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { RECONCILIATION_QUEUE } from '../../../../shared/queue/queue.constants';

const BULL_BOARD_BASE_PATH = '/admin/queues';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class DashboardController {
  private readonly serverAdapter: ExpressAdapter;
  private readonly router: Router;

  constructor(
    @InjectQueue(RECONCILIATION_QUEUE) private readonly queue: Queue,
  ) {
    this.serverAdapter = new ExpressAdapter();
    this.serverAdapter.setBasePath(BULL_BOARD_BASE_PATH);

    createBullBoard({
      queues: [new BullMQAdapter(this.queue)],
      serverAdapter: this.serverAdapter,
    });

    // Cache the router to avoid re-creating it on each request
    this.router = this.serverAdapter.getRouter() as Router;
  }

  @All('admin/queues')
  @All('admin/queues/*path')
  handleBullBoard(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ): void {
    this.router(req, res, next);
  }
}
