import { Module } from '@nestjs/common';
import { ProfilingModule } from '../profiling/profiling.module';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';

@Module({ imports: [ProfilingModule], providers: [ReviewService], controllers: [ReviewController], exports: [ReviewService] })
export class ReviewModule {}
