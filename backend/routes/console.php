<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('social-listening:dispatch-due')->dailyAt('03:00');
Schedule::command('outreach:recheck-domain-integrity')->dailyAt('04:00');
