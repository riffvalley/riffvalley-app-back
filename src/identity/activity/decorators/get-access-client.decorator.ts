import { createParamDecorator, ExecutionContext } from '@nestjs/common';

type RequestWithAccessClient = {
  user?: { clientType?: unknown };
};

export const GetAccessClient = createParamDecorator(
  (_data: unknown, context: ExecutionContext): unknown => {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithAccessClient>();
    return request.user?.clientType;
  },
);
