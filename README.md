# Fascia

Give your Express controllers TypeScript superpowers.

### Installing

Fascia has not yet released a stable version. You can get the current alpha with

```bash
npm install fascia@next
```

### Quickstart

```ts
import express from 'express';
import { withConnection } from 'fascia';

const app = express();

app.get(
  '/healthcheck',
  withConnection(conn => {
    return {
      body: 'all is well',
      status_code: 200,
      headers: {
        'content-type': 'text/plain',
      },
    };
  }),
);
```

### What is it?

Express' typescript bindings leave much to be desired. Looking at the signature for this function, what does it do?

```ts
import express from 'express';

async function requiresLogin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
): void;
```

From the name, it looks like it screens out unauthenticated users. When things go well, does it take on a `user` property to the request? Maybe. When something goes wrong, does it

- call `next(err)`, to be caught by an error handler registered later?
- _respond_ to the request with an error page when something goes wrong?
- _throw_ an error (probably a mistake)?

The point is that you can't tell from looking at the signature. What's more, the type-checker can't tell.

**Fascia enables you to encode more information about your controllers and middleware into the type system, so that you can catch errors earlier.**

### Patterns

#### Attaching user information to a request

```ts
import { Connection } from 'fascia';
import { Forbidden } from 'fascia/errors';

interface AuthorizedConn extends Connection {
  user: User;
}

async function requiresLogin(conn: Connection): Promise<AuthorizedConn> {
  if (!conn.headers.authorization) throw new Forbidden();
  const user = await verifyAuthHeader(conn.headers.authorization);
  return {
    ...conn,
    user,
  };
}
```

#### type-checking the body of a request

We lean on io-ts to to some of the heavy lifting here.

```ts
import { withConnection, decodeBody, TypedBody } from 'fascia';
import * as t from 'io-ts';

const LoginInfoV = t.type({
  username: t.string,
  password: t.string,
});

type LoginInfo = t.TypeOf<typeof LoginInfoV>;
// 👆equivalent to writing out
//   interface LoginInfo { username: string; password: string }
// but avoids the duplication.

interface WithUser {
  user: { username: string; id: string };
}

async function verifyLogin<C extends TypedBody<LoginInfo>>(conn: C>): Promise<C & WithUser> {
  const user = await lookupUser(conn.body.username);
  if (!user || !checkPassword(user.password, conn.body.password)) {
    throw new Forbidden();
  }
  return {
    ...conn,
    user,
  };
}

app.post(
  '/login',
  withConnection(conn =>
    decodeBody(LoginInfoV)
      .then(verifyLogin)
      .then(successfulLogin),
  ),
);
```
