<?php
// A PHP host reading what the library writes, through the JSON Schemas it
// publishes: the files a PHP application would store, serve or publish.

declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator;

$out = $argv[1] ?? __DIR__ . '/../../out';
$validator = new Validator();
$validator->setMaxErrors(5);
$failures = 0;

function check(string $what, bool $ok, string $detail = ''): void
{
    global $failures;
    echo ($ok ? 'PASS' : 'FAIL') . "  [php " . PHP_VERSION . "] {$what}" . ($detail === '' ? '' : "  ({$detail})") . "\n";
    if (!$ok) {
        $failures++;
    }
}

function schema(string $out, string $name): object
{
    return json_decode((string) file_get_contents("{$out}/schema/{$name}.schema.json"), false, 512, JSON_THROW_ON_ERROR);
}

function errors($result): string
{
    return $result->isValid() ? '' : json_encode((new ErrorFormatter())->format($result->error()), JSON_UNESCAPED_UNICODE);
}

$cases = [
    ['the English deck', 'deck', "{$out}/site/deck.json"],
    ['the Hebrew deck', 'deck', "{$out}/site/deck-he.json"],
    ['the media deck', 'deck', "{$out}/site/deck-media.json"],
    ['the capture manifest', 'manifest', "{$out}/shots/manifest.json"],
    ['a published shot', 'publishedShot', "{$out}/site/shots/classes.create.form.json"],
    ['a page', 'page', "{$out}/site/page.json"],
];
foreach ($cases as [$what, $name, $file]) {
    $data = json_decode((string) file_get_contents($file), false, 512, JSON_THROW_ON_ERROR);
    $result = $validator->validate($data, schema($out, $name));
    check("{$what} matches its schema", $result->isValid(), errors($result));
}

// The schema refuses what the library would refuse.
$broken = json_decode((string) file_get_contents("{$out}/site/deck.json"), false, 512, JSON_THROW_ON_ERROR);
$broken->slides[0]->content->kind = 'video';
check('a slide of an unknown kind is refused', !$validator->validate($broken, schema($out, 'deck'))->isValid());
$broken = json_decode((string) file_get_contents("{$out}/site/deck.json"), false, 512, JSON_THROW_ON_ERROR);
$broken->slides = [];
check('a deck with no slides is refused', !$validator->validate($broken, schema($out, 'deck'))->isValid());

echo $failures === 0 ? "all PHP checks passed\n" : "{$failures} PHP checks failed\n";
exit($failures === 0 ? 0 : 1);
