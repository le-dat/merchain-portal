import { Controller, Get } from '@nestjs/common';
import { Roles } from '../decorators/roles.decorator';

@Controller('users')
@Roles('ADMIN')
export class UsersController {
  @Get('list')
  listUsers() {
    return {
      message: 'User list (ADMIN access only)',
      users: [
        { email: 'admin@merchain.com', role: 'ADMIN' },
        { email: 'accountant@merchain.com', role: 'ACCOUNTANT' },
      ],
    };
  }
}
