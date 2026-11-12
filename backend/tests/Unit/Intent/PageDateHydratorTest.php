<?php

namespace Tests\Unit\Intent;

use App\Services\Intent\DTO\RawSocialHit;
use App\Services\Intent\PageDateHydrator;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PageDateHydratorTest extends TestCase
{
    public function test_reads_article_meta_json_ld_and_time_tags(): void
    {
        $dates = app(PageDateHydrator::class);
        $recent = now()->subDays(4)->startOfDay();

        $this->assertTrue($recent->equalTo($dates->dateFromHtml('<meta property="article:published_time" content="'.$recent->toIso8601String().'">')));
        $this->assertNotNull($dates->dateFromHtml('<script type="application/ld+json">{"datePublished":"'.$recent->toDateString().'"}</script>'));
        $this->assertNotNull($dates->dateFromHtml('<time datetime="'.$recent->toDateString().'">4 days ago</time>'));
        $this->assertNull($dates->dateFromHtml('<p>No date here</p>'));
    }

    public function test_hydrates_only_undated_posts(): void
    {
        $recent = now()->subDays(2)->toIso8601String();
        Http::fake(['https://blog.example/post' => Http::response('<meta property="article:published_time" content="'.$recent.'">', 200)]);

        $hit = new RawSocialHit('web', 'Web', 'w', 'We supply cocoa beans', 'https://blog.example/post', null, 'Post');
        $out = app(PageDateHydrator::class)->hydrateMany([7 => $hit]);

        $this->assertNotNull($out[7]->postedAt);
        $this->assertSame('We supply cocoa beans', $out[7]->postText);
    }
}
