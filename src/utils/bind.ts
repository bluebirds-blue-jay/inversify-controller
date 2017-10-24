import { Application, Router, Request, Response, NextFunction } from 'express';
import { Container } from 'inversify';
import { IController } from '../interfaces';
import { MetadataKey } from '../constants/metadata-key';
import { ensureLeadingSlash } from '@bluejay/url';
import { TRouteDescription } from '../types/route-description';

export function bind(app: Application, container: Container, identifier: symbol, _isInitial: boolean = true): Router {
  const controller = container.get<IController>(identifier);
  const childrenIdentifiers = Reflect.getMetadata(MetadataKey.CHILDREN_IDENTIFIERS, controller) || [];
  const routes: TRouteDescription[] = Reflect.getMetadata(MetadataKey.ROUTES, controller) || [];
  const beforeMiddlewares = Reflect.getMetadata(MetadataKey.BEFORE_MIDDLEWARES, controller) || [];
  const afterMiddlewares = Reflect.getMetadata(MetadataKey.AFTER_MIDDLEWARES, controller) || [];

  for (const middleware of beforeMiddlewares) {
    controller.getRouter().use(middleware);
  }

  for (const route of routes) {
    const routeBeforeMiddlewares = Reflect.getMetadata(MetadataKey.ROUTE_BEFORE_MIDDLEWARES, controller, route.handlerName) || [];
    const routeAfterMiddlewares = Reflect.getMetadata(MetadataKey.ROUTE_AFTER_MIDDLEWARES, controller, route.handlerName) || [];
    const handlers = [...routeBeforeMiddlewares, route.handler, ...routeAfterMiddlewares].map(handler => {
      if (handler.length < 4) {
        // Wrap handler to catch errors. This allows consumers to not have to use try/catch for each handler.
        const fn = async function(req: Request, res: Response, next: NextFunction): Promise<void> {
          try {
            await route.handler.call(controller, req, res, next);
          } catch (err) {
            next(err);
          }
        };

        Object.defineProperty(fn, 'name', { value: handler.name });

        return fn;
      }

      return handler; // Special case for Express's error handler
    });

    controller.getRouter()[route.method](route.path, ...handlers);
  }

  for (const childIdentifier of childrenIdentifiers) {
    const child = container.get<IController>(childIdentifier);
    controller.getRouter().use(ensureLeadingSlash(child.getPath()), bind(app, container, childIdentifier, false));
  }

  for (const middleware of afterMiddlewares) {
    controller.getRouter().use(middleware);
  }

  if (_isInitial) {
    app.use(controller.getPath(), controller.getRouter());
  }

  return controller.getRouter();
}