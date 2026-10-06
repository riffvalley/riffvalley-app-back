import { Injectable } from '@nestjs/common';
import * as fs from 'fs';

@Injectable()
export class ManualImportLogger {
  private readonly logStream: fs.WriteStream;

  constructor() {
    this.logStream = fs.createWriteStream('manual_data.log', { flags: 'a' });
  }

  log(message: string): void {
    try {
      const timestamp = new Date().toISOString();
      this.logStream.write(`[${timestamp}] ${message}\n`);
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }
}
