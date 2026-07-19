import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * Real-time transport for balances, deals, chat, order book and notifications.
 * Clients authenticate by passing a JWT access token in the handshake auth.
 */
@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: '/ws',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers.authorization?.replace('Bearer ', '') ?? '');
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      client.join(this.userRoom(payload.sub));
      if (payload.role === 'ADMIN') {
        client.join('admins');
      }
      client.join('orderbook');
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {
    // no-op; rooms are cleaned up automatically
  }

  @SubscribeMessage('deal:join')
  onDealJoin(client: Socket, dealId: string) {
    client.join(this.dealRoom(dealId));
    return { joined: dealId };
  }

  @SubscribeMessage('deal:leave')
  onDealLeave(client: Socket, dealId: string) {
    client.leave(this.dealRoom(dealId));
    return { left: dealId };
  }

  // ---- emit helpers ----
  private userRoom(userId: string) {
    return `user:${userId}`;
  }
  private dealRoom(dealId: string) {
    return `deal:${dealId}`;
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(this.userRoom(userId)).emit(event, payload);
  }

  emitToDeal(dealId: string, event: string, payload: unknown) {
    this.server?.to(this.dealRoom(dealId)).emit(event, payload);
  }

  emitToAdmins(event: string, payload: unknown) {
    this.server?.to('admins').emit(event, payload);
  }

  emitOrderbook(event: string, payload: unknown) {
    this.server?.to('orderbook').emit(event, payload);
  }
}
