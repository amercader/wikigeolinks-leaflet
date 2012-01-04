<?php

$url = $_GET["url"];

$allowed = array("localhost","127.0.0.1");

$host = parse_url($url,PHP_URL_HOST);
if (!in_array($host,$allowed)){
    header($_SERVER["SERVER_PROTOCOL"]." 403 Forbidden");
    die("Forbidden");
}

$ch = curl_init();

// set URL and other appropriate options
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_HEADER, 0);
curl_setopt($ch, CURLOPT_HEADERFUNCTION, "forwardHeaders");
//curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_exec($ch);

// close cURL resource, and free up system resources
curl_close($ch);

exit();



function forwardHeaders($ch, $string) {

    $length = strlen($string);
    $header = trim($string);
    $supported = array("date", "server", "last-modified", "etag", "content-type", "via");

    $parts = explode(":",$header);
    
    if (strlen($header) && in_array(strtolower(trim($parts[0])),$supported)) {
        header($header);
    }

    return $length;
}

?>
