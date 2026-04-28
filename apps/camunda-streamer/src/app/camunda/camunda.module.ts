import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CamundaService } from './camunda.service';

@Module({
  imports: [HttpModule],
  providers: [CamundaService],
  exports: [CamundaService],
})
export class CamundaModule {}
