import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto/login.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(dto: LoginDto): Promise<import("./auth.service").TokenResponse>;
    refresh(dto: RefreshDto): Promise<import("./auth.service").TokenResponse>;
}
