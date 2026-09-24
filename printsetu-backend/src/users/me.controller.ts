import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/request-context';
import { UpdatePreferencesDto } from './dto/preferences.dto';
import { UsersService } from './users.service';

/** The signed-in user's own settings (any role). */
@Controller('me')
export class MeController {
  constructor(private readonly usersService: UsersService) {}

  @Get('preferences')
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPreferences(user.id);
  }

  @Patch('preferences')
  updatePreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePreferencesDto) {
    return this.usersService.updatePreferences(user.id, dto);
  }
}
