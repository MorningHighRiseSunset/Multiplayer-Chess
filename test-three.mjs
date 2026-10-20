export default async function run(page, ui) {
  await page.waitForTimeout(2000);
  const result = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script')).map(s => ({
      src: s.src,
      error: s.onerror ? 'has error handler' : 'no error handler',
      readyState: s.readyState
    }));
    const threeExists = typeof THREE !== 'undefined';
    const threeRev = typeof THREE !== 'undefined' ? THREE.REVISION : 'N/A';
    const hasJSONLoader = typeof THREE !== 'undefined' ? typeof THREE.JSONLoader : 'N/A';
    return { scripts, threeExists, threeRev, hasJSONLoader };
  });
  return result;
}
