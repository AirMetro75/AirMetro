import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); errs=[]
        for name,vp,dark in [('desk',{'width':1280,'height':900},True),('mob',{'width':390,'height':844},False)]:
            ctx=await b.new_context(viewport=vp,device_scale_factor=1.5,color_scheme='dark' if dark else 'light')
            pg=await ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
            await pg.goto('http://localhost:8790/'); await pg.wait_for_timeout(1200)
            print(name,'demo banner visible:',await pg.is_visible('#demoBanner'),'| kpis',[await pg.inner_text(i) for i in ['#kCount','#kSt','#kAvg']])
            await pg.fill('#q','nation'); await pg.wait_for_timeout(200); await pg.click('#sugg button >> nth=0'); await pg.wait_for_timeout(400)
            print(' detail:',(await pg.inner_text('#detail'))[:160].replace('\n',' | '))
            await pg.screenshot(path=f'/tmp/claude-0/site_{name}.png',full_page=(name=='mob'))
            if name=='desk':
                await pg.click('#m10'); await pg.click('[data-d="7"]'); await pg.wait_for_timeout(500)
                await pg.click('#chips .chip >> nth=5'); await pg.wait_for_timeout(300)
                print(' filtre ligne 4:',await pg.inner_text('#kSt'),'stations; legend:',(await pg.inner_text('#legend'))[-50:].replace('\n',' '))
                await pg.click('.rank button >> nth=0'); await pg.wait_for_timeout(300)
                await pg.screenshot(path='/tmp/claude-0/site_desk2.png')
            await ctx.close()
        # démo
        ctx=await b.new_context(viewport={'width':390,'height':844}); pg=await ctx.new_page()
        await pg.goto('http://localhost:8790/?demo'); await pg.wait_for_timeout(800); print('demo banner:',await pg.is_visible('#demoBanner'))
        # contribuer
        pg=await ctx.new_page(); await pg.goto('http://localhost:8790/contribuer.html')
        await pg.set_input_files('#files','/tmp/claude-0/j.csv'); await pg.wait_for_timeout(400)
        print('preview:',(await pg.inner_text('#preview'))[:120].replace('\n',' | '))
        await pg.fill('#key','mauvaise'); await pg.click('#send'); await pg.wait_for_timeout(600); print('mauvaise clé ->',await pg.inner_text('#msg'))
        await pg.fill('#key','secret-test'); await pg.click('#send'); await pg.wait_for_timeout(800); print('bonne clé ->',await pg.inner_text('#msg'))
        await pg.screenshot(path='/tmp/claude-0/site_contrib.png',full_page=True)
        print('errors',errs); await b.close()
asyncio.run(main())
