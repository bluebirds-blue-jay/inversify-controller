# Inversify Controller

[![npm](https://img.shields.io/npm/v/@bluejay/inversify-controller.svg?style=flat-square)](https://www.npmjs.com/package/@bluejay/inversify-controller)
 [![npm](https://img.shields.io/npm/dm/@bluejay/inversify-controller.svg?style=flat-square)](https://www.npmjs.com/package/@bluejay/inversify-controller)
[![npm](https://img.shields.io/npm/l/@bluejay/inversify-controller.svg?style=flat-square)](https://www.npmjs.com/package/@bluejay/inversify-controller)

## Requirements

- `node >= 7.10`
- `typescript >= 2.4`
- [Inversify](https://github.com/inversify/InversifyJS#installation)

## Installation

`npm i inversify reflect-metadata @bluejay/inversify-controller`

## Note on JSON schemas

We use [AJV](https://github.com/epoberezkin/ajv) internally for schema validation. Decorators that perform schema validation offer you to create your own AJV instance through the `ajvFactory` option. If you are to create your own instances through this option, we highly recommend to make sure you pass the same options we use along with yours, otherwise some assumptions from this documentation might not be true.

Although you can use plain JSON schemas, we recommend the use of Bluejay's [schema](https://github.com/bluebirds-blue-jay/schema) module for easier schema manipulation. The examples below make use of this module, but be aware that you can use plain JSON schemas instead. 

## Usage

### Creating a root controller

```typescript
import { Controller, path } from '@bluejay/inversify-controller';

@path('/')
class RootController extends Controller {
  
}
```

### Binding your root controller to your Express application / Inversify container

The `bind()` helper correlates your express app, your Inversify container and your root controller.

```typescript
import { bind } from '@bluejay/inversify-controller';
import * as express from 'express';
import { container } from './inversify.config';
import { Identifiers } from './constants/identifiers'; // Inversify identifiers

const app = express();

bind(app, container, Identifiers.RootController); // This is required and must happen early in your application, ideally right after your create your app
```

### Nesting controllers

We use a hierarchical structure that starts with the `RootController` and controllers can declare their children. We use a child relationship - as opposed to a parent relationship - in order to make controllers reusable (ie. declarable on multiple parents).

```typescript
// controllers/user-posts
@path('/:id/friends') // Routes in this controller are accessible through /users/:id/friends
class UserPostsController extends Controller {
  
}

// controllers/users
@path('/users')
@child(Identifiers.UserPostsController)
class UsersController extends Controller {
  
}

// controllers/root
@oath('/')
@child(Identifiers.UsersController)
class RootController extends Controller {
  
}
```

### Middlewares

This module encourages you to declare middlewares at the controller level (vs. at the app level).

#### Global middlewares

Since the middlewares are attached to the root controller, all routes from all children will inherit them. This gives you the same result as if you were using `app.use()`, but keeps everything in the same place.

```typescript
import { before, after } from '@bluejay/inversify-controller';
import { bodyParser } from 'body-parser';
import { errorHandler } from ''

@before(bodyParser.json())
@after(errorHandler())
@path('/')
class RootController extends Controller {
  
}
```

Below we register a middleware that's specific to the UsersController.

```typescript
@path('/users')
@before(logMiddleware) // Only /users routes (and descendants) will be affected
class UsersController extends Controller {
  
}
```

#### Passing arguments to global middlewares

There are times where you need to inject some properties into a middleware, which properties are accessible in the controller itself. `@beforeFactory` and `@afterFactory` allow you to differ a middleware's creation.

```typescript
@beforeFactory(function(this: RootController) { // Notice the usage of a regular function
  return logMiddlewareFactory(this.logger);
})
class RootController extends Controller {
  @inject(Identifiers.LoggerService) public logger: ILoggerService;  
}
```

#### Route level middlewares

Route level middlewares are declared the exact same way as controller middlewares, using `@before`, `@after` and `@beforeFactory`. `@afterFactory` is currently not supported.

```typescript
class UsersController extends Controller {
  private foo: string = 'bar';
  
  @get('/')
  @before(queryParser())
  @before(function(this: UsersController, req: Request, res: Response, next: NextFunction) {
    console.log(this.foo); // bar
    next();
  })
  public async list(req: Request, res: Response) {
    
  }
}
```

### Declaring routes

This module offers http decorators for all HTTP verbs. Check each decorator's documentation for specific options.

```typescript
class UsersController extends Controller {
  
  @get('/')
  public async list(req: Request, res: Response) {
    
  }
  
  @get('/:id')
  public async getById(req: Request, res: Response) {
      
  }
  
  @post('/')
  public async add(req: Request, res: Response) {
      
  }
  
  @del('/:id')
  public async removeById(req: Request, res: Response) {
    
  }
  
  // ...
}
```

### Path parameters validation

Path parameters have to be declared in your route's path. Additionally, this module offers validation and type coercion through JSON schemas and the `@params()` decorator.   

```typescript
import { object, integer, requireProperties } from '@bluejay/schema'; 

class UsersController extends Contoller {
  @get('/:id')
  @params(requireProperties(object({ id: integer() }), ['id']))
  public async getById(req: Request, res: Response) {
    const { id } = req.params;
    console.log(typeof id); // number, thanks to Ajv's "coerceTypes" option
  }
}
```

An instance of AJV is created by default, if you want to pass your own, provide a `ajvFactory` to the options.

```typescript
import { object, integer, requireProperties } from '@bluejay/schema';
import * as Ajv from 'ajv';

const idParamSchema = object({ id: integer() });

class UsersController extends Contoller {
  @get('/:id')
  @params({
    jsonSchema: requireProperties(idParamSchema, ['id']),
    ajvFactory: () => new Ajv({ coerceTypes: true })
  })
  public async getById(req: Request, res: Response) {
    const { id } = req.params;
    console.log(typeof id); // number
  }
}
```

If the params don't match `jsonSchema`, a `BadRequest` error will be thrown and be handled by your error middleware, meaning that your handler will never be called.


##### Query parameters validation

Query parameters are validated through JSON schemas using the `@query()` decorator.

All HTTP method decorators also accept an optional `query` option with the same signature as the decorator.

```typescript
import { object, boolean } from '@bluejay/schema';

class UsersController extends Controller {
  @get('/')
  @query(object({ active: boolean() }))
  public async list(req: Request, res: Response) {
    const { active } = req.query;
    console.log(typeof active); // boolean | undefined (since not required)
  }
}
```

A `BadRequest` error will be thrown in case the query doesn't match the described schema, in which case your handler will never be called.

##### Grouping query parameters

Groups allow you to group properties from the `query` object and are managed by a `groups` hash of the form `{ [groupName]: groupProperties }`.

Those come handful if your application exposes complex query parameters to the end user, and you need to pass different properties to different parts of your application. 

```typescript
class UsersController extends Controller {
  
  @query({
    jsonSchema: object({ active: boolean(), token: string() }),
    groups: { filters: ['active'] }
  })
  @get('/')
  public async list(req: Request, res: Response) {
    const { filters, token } = req.query;
    console.log(typeof token); // string
    console.log(typeof filters); // object
    console.log(typeof filters.active); // boolean | undefined (since not required)
    console.log(req.query.active); // undefined (grouped properties are removed from the root query)
  }
}
```

##### Transforming query parameters

`transform` allows you to process and modify the query string before the groups are formed. This is useful if, for example the interface your application offers to its consumers differs from the interface used within the application. 

*Note:* The `transform` hook is called before parameters are grouped. Also note that you can use `transform` without groups.

```typescript

const queryTransformer = (query: object) => {
  query.active = query.isActive;
  delete query.isActive; // Clean
  return query;
};

class UsersController extends Controller {
  @query({
    jsonSchema: object({ isActive: boolean() }),
    transform: queryTransformer
  })
  @get('/')
  public async list(req: Request, res: Response) {
    const { active } = req.query;
    console.log(typeof active); // boolean
    console.log(typeof req.query.isActive); // undefined
  }
}
```

### Body validation

We currently only offer validation for JSON body. You can declare bodies of another type, but you will need to handle the validation by yourself. Bodies are managed through the `@body()` decorator.

#### JSON body

```typescript
const userSchema = object({
  email: email(),
  password: string(),
  first_name: string({ nullable: true }),
  last_name: string({ nullable: true })
});

class UsersController extends Controller {
  @post('/')
  @body(requireProperties(userSchema, ['email', 'password']))
  public async add(req: Request, res: Response) {
    // req.body is guaranteed to match the described schema
  }
}
```

A `BadRequest` error will be thrown in case the body doesn't match the described schema, in which case your handler will never be called.

#### Other types

The only validation possible for now is the content type, and this is done via the `@is` decorator, which validates the content type of the body.

```typescript
class UsersController extends Controller {
  @put('/:id/picture')
  @is('image/jpg')
  @before(multer.single('file')) // Just an example, see https://www.npmjs.com/package/multer
  public async changePicture(req: Request, res: Response) {
    
  }
}
```

### Response validation

Might you want to filter some fields, coerce some types or simply make sure that your responses are up to the documentation you provided to your customers, we help you do so using JSON schemas. It is also possible to describe other types of responses, but only JSON bodies are validated for now.

*Note:* Only the "expected" response can be described for now.

#### JSON response

In the example below and even though we didn't ask for specific attributes, the "password" field will never be exposed since it's not part of the schema. In other words, the response only contains the properties described in the schema. 

```typescript
import { object, email, string, omitProperties } from '@bluejay/schema';

const userSchema = object({
  email: email(),
  password: string(),
  first_name: string({ nullable: true }),
  last_name: string({ nullable: true })
});

class UsersController extends Controller {
  @get('/:id')
  @response({
    statusCode: StatusCode.OK,
    jsonSchema: omitProperties(userSchema, ['password'])
  })
  public async getById(req: Request, res: Response) {
    const { id } = req.params;
    const user = await this.userService.findById(id);
    if (user) {
      res.json(user);
    } else {
      throw new NotFoundRestError(`No user found for id ${id}.`)
    }
  }
}
```

An `InternalServerError` error will be thrown in case the response's body doesn't match the described schema.

#### Other types

```typescript
class UsersController extends Controller {
  @get('/:id/picture')
  @response({
    statusCode: StatusCode.OK,
    contentType: 'image/jpg'
  })
  public async getPicture(req: Request, res: Response) {
    getPictureStream(req.params.id).pipe(res);
  }
}
```

## API Documentation

See [Github Pages](https://bluebirds-blue-jay.github.io/inversify-controller/).
