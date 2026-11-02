<?php

namespace App\Console\Commands;

use App\Models\PlatformAdmin;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

class CreatePlatformAdminCommand extends Command
{
    protected $signature = 'admin:create-platform-admin
        {--name= : Display name}
        {--email= : Login email}
        {--password= : Login password}';

    protected $description = 'Create or update a platform admin account for the Sales Engine admin app';

    public function handle(): int
    {
        $name = (string) ($this->option('name') ?: env('PLATFORM_ADMIN_NAME', 'Platform Admin'));
        $email = mb_strtolower(trim((string) ($this->option('email') ?: env('PLATFORM_ADMIN_EMAIL', ''))));
        $password = (string) ($this->option('password') ?: env('PLATFORM_ADMIN_PASSWORD', ''));

        if ($email === '' || $password === '') {
            $this->error('Provide --email/--password or set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD.');

            return self::FAILURE;
        }

        $validator = Validator::make(
            ['name' => $name, 'email' => $email, 'password' => $password],
            [
                'name' => ['required', 'string', 'max:255'],
                'email' => ['required', 'email', 'max:255'],
                'password' => ['required', 'string', 'min:8'],
            ],
        );

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->error($error);
            }

            return self::FAILURE;
        }

        $admin = PlatformAdmin::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => $password,
                'is_active' => true,
            ],
        );

        $this->info("Platform admin ready: {$admin->email} (id {$admin->id})");

        return self::SUCCESS;
    }
}
