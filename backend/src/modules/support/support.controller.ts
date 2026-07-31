import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { SupportService } from './support.service';

class SupportMsgDto {
  @IsString()
  @MinLength(1)
  body!: string;
}

@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Get('ticket')
  myTicket(@CurrentUser() user: AuthUser) {
    return this.support.getOrCreateTicket(user.id);
  }

  @Post('messages')
  send(@CurrentUser() user: AuthUser, @Body() dto: SupportMsgDto) {
    return this.support.sendUserMessage(user.id, dto.body);
  }
}

@Roles('ADMIN')
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  list() {
    return this.support.listOpenTickets();
  }

  @Get('tickets/:id')
  one(@Param('id') id: string) {
    return this.support.getTicketAdmin(id);
  }

  @Post('tickets/:id/messages')
  reply(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() dto: SupportMsgDto) {
    return this.support.replyAdmin(admin.id, id, dto.body);
  }

  @Post('tickets/:id/close')
  close(@Param('id') id: string) {
    return this.support.closeTicket(id);
  }
}
