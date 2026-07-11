import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ConnectionHandler } from '../network/ConnectionHandler.js';
import { config } from '../config.js';

declare module 'fastify' {
  interface FastifyInstance {
    connectionHandler: ConnectionHandler;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  const connectionHandler = new ConnectionHandler();

  fastify.decorate('connectionHandler', connectionHandler);

  fastify.get('/ws', { websocket: true }, (socket, req) => {
    if (connectionHandler.getConnectionCount() >= config.limits.maxConnections) {
      req.log.warn('WS connection rejected: max connections reached');
      socket.close(1013, 'Server full');
      return;
    }
    connectionHandler.handleConnection(socket);
  });

};

export const websocketPlugin = fp(plugin);
