async (page) => {
  const results=[];const check=async(c,label)=>{if(!await c)throw Error(label);results.push(label);};
  await page.getByRole('button',{name:'Import CSV',exact:true}).click();
  await page.locator('#csv-file').setInputFiles('tests/fixtures/import.csv');
  await page.getByRole('heading',{name:'One last look'}).waitFor();
  await check(page.locator('.import-preview>p').first().textContent().then(t=>t.includes('4 rows')&&t.includes('1 ready')&&t.includes('2 duplicates')&&t.includes('1 invalid')),'CSV preview counts');
  await check(page.locator('.import-rows').textContent().then(t=>t.includes('private preview field')),'Unknown column shown in preview');
  await page.getByRole('button',{name:'Cancel preview'}).click();
  await page.getByRole('button',{name:'Back to library',exact:true}).click();
  await page.getByRole('textbox',{name:'Search library'}).fill('qa-import');
  await check(page.locator('.word-row').count().then(n=>n===0),'Cancel preview does not write');
  await page.getByRole('button',{name:'Import CSV',exact:true}).click();
  await page.locator('#csv-file').setInputFiles('tests/fixtures/import.csv');
  await page.getByRole('button',{name:'Import 1 words',exact:false}).click();
  await page.getByRole('heading',{name:'Today',exact:true}).waitFor();
  await page.getByRole('button',{name:/Library/}).click();
  await check(page.locator('.word-row').count().then(n=>n===1),'CSV confirmation writes exactly one valid word');
  await page.locator('.word-open').click();
  await check(page.locator('.detail-examples>div').count().then(n=>n===2),'Multiple example columns preserved');
  await check(page.locator('.note-block').textContent().then(t=>t.includes('a note, with comma')),'Quoted CSV comma preserved');
  await check(page.locator('.detail-examples').textContent().then(t=>t.includes('A second\nline example.')),'Quoted CSV newline preserved');
  await page.getByRole('button',{name:'Back to library',exact:true}).click();
  await page.getByRole('button',{name:'Today',exact:true}).click();
  console.log(JSON.stringify(results));
}
