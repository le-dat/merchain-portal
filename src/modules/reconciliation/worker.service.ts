import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);

  run() {
    this.logger.log('Worker service initialized');

    // Giữ tiến trình sống phục vụ local development testing
    setInterval(() => {
      this.logger.debug('Worker heartbeat: WAITING');
    }, 10000);
  }
}
