import { Route } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { load } from 'cheerio';
import { parseDate } from '@/utils/parse-date';
import timezone from '@/utils/timezone';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezonePlugin from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezonePlugin);

export const route: Route = {
    path: '/rmrb/:id?',
    categories: ['traditional-media'],
    example: '/people/rmrb/01',
    parameters: { id: '版面 id，可在对应版面页面的 URL 中找到，默认为 01' },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '人民日报',
    maintainers: ['zhangsan-xyz'],
    handler,
};

async function handler(ctx) {
    const id = ctx.req.param('id') || '01';
    const rootUrl = 'https://paper.people.com.cn/rmrb/pc/layout';
    
    // Use current date in Beijing time
    const dateStr = dayjs().tz('Asia/Shanghai').format('YYYYMM/DD');
    
    const currentUrl = `${rootUrl}/${dateStr}/node_${id}.html`;
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    let response;
    try {
        response = await ofetch(currentUrl, { headers });
    } catch (e) {
        // If today's paper is not out yet, try yesterday
        const yesterday = dayjs().tz('Asia/Shanghai').subtract(1, 'day').format('YYYYMM/DD');
        const yesterdayUrl = `${rootUrl}/${yesterday}/node_${id}.html`;
        response = await ofetch(yesterdayUrl, { headers });
    }

    const $ = load(response);
    const list = $('.news-list li a')
        .toArray()
        .map((item) => {
            const a = $(item);
            return {
                title: a.text().trim(),
                link: new URL(a.attr('href'), currentUrl).href,
            };
        });

    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                const detailRes = await ofetch(item.link, { headers });
                const $detail = load(detailRes);
                
                const title = $detail('h1').text().trim() || $detail('h2').text().trim() || item.title;
                const content = $detail('#ozoom').html();
                
                return {
                    title,
                    description: content,
                    link: item.link,
                    pubDate: timezone(parseDate(dateStr, 'YYYYMM/DD'), 8),
                };
            })
        )
    );

    return {
        title: `人民日报 - ${$('title').text()}`,
        link: currentUrl,
        item: items,
    };
}
