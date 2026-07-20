import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          url:
            process.env.REDIS_URLS?.split(',')[0]?.trim() ??
            'redis://localhost:6379',
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
