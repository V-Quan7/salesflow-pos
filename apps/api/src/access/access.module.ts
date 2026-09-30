import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AccessController } from './access.controller';

@Module({ imports: [AuthModule], controllers: [AccessController] })
export class AccessModule {}
