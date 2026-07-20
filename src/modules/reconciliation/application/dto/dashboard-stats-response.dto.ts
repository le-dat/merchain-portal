export class UploadResponseDto {
  jobId: string;
  status: 'queued';
  message: string;
}

export class JobStatusResponseDto {
  jobId: string;
  state: string;
  progress: unknown;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
}
