import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from './shared/database/database.module';
import { RedisModule } from './shared/redis/redis.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './shared/exceptions/all-exceptions.filter';

@Module({
  imports: [DatabaseModule, RedisModule, ReconciliationModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
