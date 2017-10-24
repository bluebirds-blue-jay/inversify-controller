import { NextFunction, Request, Response } from 'express';
import { Controller } from '../../src/classes/controller';
import { path } from '../../src/decorators/path';
import { beforeFactory } from '../../src/decorators/before-factory';
import { StatusCode } from '@bluejay/status-code';
import { Sandbox } from '../resources/classes/sandbox';
import supertest = require('supertest');
import { get } from '../../src/decorators/get';
import { before } from '../../src/decorators/before';
import bodyParser = require('body-parser');

describe('@afterFactory()', () => {
  const middlewareFactory = function() {
    return (req: Request, res: Response) => {
      res.json({ testProperty: this.testProperty });
    }
  };

  it('should register middleware', async () => {
    const id = Symbol();

    @path('/test')
    @beforeFactory(middlewareFactory)
    @before(bodyParser.json())
    class TestController extends Controller {
      private testProperty: string = 'foo';

      @get('/')
      private async test(req: Request, res: Response, next: NextFunction) {
        next();
      }
    }

    const sandbox = new Sandbox({
      controllersMap: new Map([
        [id, TestController]
      ])
    });

    await supertest(sandbox.getApp())
      .get('/test')
      .expect(StatusCode.OK, { testProperty: 'foo' });
  });
});