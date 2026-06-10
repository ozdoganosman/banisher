#!/usr/bin/env node
// dist çıktısını tek dosyalık oynanabilir HTML'e çevirir.
// NOT: replace'e fonksiyon veriyoruz; yoksa JS içindeki "$&" gibi
// diziler yer-değiştirme komutu sanılıp dosyayı bozuyor.
const fs = require("fs");

const html = fs.readFileSync("dist/index.html", "utf8");
const jsFile = fs.readdirSync("dist/assets").find((f) => f.endsWith(".js"));
const js = fs.readFileSync("dist/assets/" + jsFile, "utf8");
const inline = "<script type=\"module\">" + js.replace(/<\/script>/g, "<\\/script>") + "</script>";
const out = html.replace(/<script[^>]*src=[^>]*><\/script>/, () => inline);
const target = process.argv[2] ?? "/tmp/banisher.html";
fs.writeFileSync(target, out);
console.log("yazıldı:", target, out.length, "bayt");
