# syntax=docker/dockerfile:1

# Sales Engine API — flat Laravel layout (app at repo root).
# Pinned to Debian Bookworm for stable PHP extension packages.
FROM php:8.3-fpm-bookworm

RUN apt-get update && apt-get install -y \
    git curl unzip zip \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    libzip-dev \
 && docker-php-ext-install \
    pdo_mysql \
    mbstring \
    exif \
    pcntl \
    bcmath \
    gd \
    zip \
 && rm -rf /var/lib/apt/lists/*

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

# Resolve dependencies before copying the app so this layer is only rebuilt when
# the lock file changes; ordinary code pushes reuse the cached vendor/.
COPY composer.json composer.lock ./

# GitHub throttles anonymous dist downloads from shared CI IPs with HTTP 429.
# Pass COMPOSER_AUTH via BuildKit secret when available.
RUN --mount=type=secret,id=composer_auth \
    --mount=type=cache,target=/tmp/composer-cache,sharing=locked \
    export COMPOSER_CACHE_DIR=/tmp/composer-cache \
    && export COMPOSER_MAX_PARALLEL_HTTP=6 \
    && if [ -s /run/secrets/composer_auth ]; then \
         COMPOSER_AUTH="$(cat /run/secrets/composer_auth)"; \
         export COMPOSER_AUTH; \
       fi \
    && for attempt in 1 2 3 4 5; do \
         composer install \
           --no-dev \
           --no-scripts \
           --no-autoloader \
           --prefer-dist \
           --no-interaction && exit 0; \
         echo "composer install attempt ${attempt} failed; retrying in $((attempt * 20))s"; \
         sleep $((attempt * 20)); \
       done; \
    exit 1

COPY . .

# Autoloader needs full application source.
RUN composer dump-autoload --no-dev --optimize --no-interaction \
 && mkdir -p storage/framework/views \
             storage/framework/sessions \
             storage/framework/cache/data \
             storage/logs \
             storage/app/public \
             bootstrap/cache \
 && chown -R www-data:www-data storage bootstrap/cache

# Pre-warm caches using placeholder env (overridden at runtime by K8s init).
RUN php artisan config:cache || true \
 && php artisan route:cache || true \
 && php artisan view:cache || true

CMD ["php-fpm"]
