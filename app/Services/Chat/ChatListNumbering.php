<?php

namespace App\Services\Chat;

class ChatListNumbering
{
    /**
     * Fix GLM habit of emitting "1. 1. 1." instead of "1. 2. 3.".
     * Also renumbers any run of leading ordinals that restart at 1.
     */
    public function normalize(string $text): string
    {
        $lines = preg_split("/\r\n|\n|\r/", $text) ?: [$text];
        $counter = 0;
        $inNumberedRun = false;

        foreach ($lines as $i => $line) {
            if (preg_match('/^(\s*)(\d+)\.\s+(.*)$/u', $line, $m)) {
                $ordinal = (int) $m[2];
                if (! $inNumberedRun) {
                    $counter = $ordinal > 0 ? $ordinal : 1;
                    $inNumberedRun = true;
                } else {
                    // GLM often repeats "1." — always continue the sequence inside a run.
                    $counter++;
                }
                $lines[$i] = $m[1] . $counter . '. ' . $m[3];
            } elseif (trim($line) === '') {
                // Blank lines keep the run so multi-paragraph list items stay sequential.
                continue;
            } else {
                $inNumberedRun = false;
                $counter = 0;
            }
        }

        return implode("\n", $lines);
    }
}
