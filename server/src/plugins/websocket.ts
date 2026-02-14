import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ConnectionHandler } from '../network/ConnectionHandler.js';

declare module 'fastify' {
  interface FastifyInstance {
    connectionHandler: ConnectionHandler;
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  const connectionHandler = new ConnectionHandler();

  // Decorate the fastify instance
  fastify.decorate('connectionHandler', connectionHandler);

  // WebSocket upgrade route
  fastify.get('/ws', { websocket: true }, (socket) => {
    connectionHandler.handleConnection(socket);
  });

};

export const websocketPlugin = fp(plugin);
