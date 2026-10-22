<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Storage;

class AvatarService
{
    /** @var list<string> */
    private const MALE = ['male_01', 'male_02', 'male_03'];

    /** @var list<string> */
    private const FEMALE = ['female_01', 'female_02', 'female_03'];

    public function urlFor(User $user): string
    {
        $stored = $this->storedUrl($user);
        if ($stored !== null) {
            return $stored;
        }

        $gender = $this->normalizeGender($user->gender);
        if ($gender === null) {
            return '/avatars/default-ghost.svg';
        }

        $options = $gender === 'male' ? self::MALE : self::FEMALE;
        $index = abs(crc32((string) $user->getKey().'|'.$user->email)) % count($options);

        return '/avatars/'.$gender.'/'.$options[$index].'.svg';
    }

    public function normalizeGender(mixed $gender): ?string
    {
        if (! is_string($gender)) {
            return null;
        }

        $normalized = strtolower(trim($gender));

        return in_array($normalized, ['male', 'female'], true) ? $normalized : null;
    }

    public function realAvatarUrl(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $url = trim($value);
        if ($url === '' || $this->isPlaceholder($url)) {
            return null;
        }

        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://') || str_starts_with($url, '/')) {
            return $url;
        }

        return null;
    }

    public function canReplaceAvatar(User $user): bool
    {
        $path = trim((string) $user->avatar_path);
        if ($path === '' || $this->isPlaceholder($path)) {
            return true;
        }

        return str_starts_with($path, 'http://') || str_starts_with($path, 'https://') || str_starts_with($path, '/avatars/');
    }

    private function storedUrl(User $user): ?string
    {
        $path = trim((string) $user->avatar_path);
        if ($path === '' || $this->isPlaceholder($path)) {
            return null;
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://') || str_starts_with($path, '/')) {
            return $path;
        }

        return Storage::disk('public')->url($path);
    }

    private function isPlaceholder(string $path): bool
    {
        return str_contains($path, '/avatar/default/ghost') || str_ends_with($path, '/avatars/default-ghost.svg');
    }
}
