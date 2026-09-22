const KEY = 'b9e44a502ee15955bb49f03be4717380';
const HOSTS = ['cordhq.app', 'docs.cordhq.app', 'dev.cordhq.app'];

for (const host of HOSTS) {
    const xml = await (await fetch(`https://${host}/sitemap.xml`)).text();
    const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (!urlList.length) {
        console.log(`${host}: sin URLs en el sitemap`);
        continue;
    }
    const res = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ host, key: KEY, keyLocation: `https://${host}/${KEY}.txt`, urlList }),
    });
    console.log(`${host}: ${urlList.length} URLs -> ${res.status}`);
}
