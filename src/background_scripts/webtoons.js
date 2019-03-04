import {openPages} from './index';
import {webtoonDateWithOffset} from '../shared';

function getWebtoonDay(date, offset = 0){
  return webtoonDateWithOffset(date, offset).day();
}

async function getDate(tabId){
  return new Promise(res => {
    chrome.tabs.sendMessage(tabId, {
      requestType: "getDateWebtoon"
    }, res)
  })
}

export async function getTitleOrder(tabId, {offset} = {}) {
  const date = await getDate(tabId);
  return new Promise((res, rej) => {
    chrome.storage.local.get('webtoonOrder', function(data) {
      let order = data.webtoonOrder;
      res(order && order[getWebtoonDay(date, offset)] || []);
    })
  })
}

async function saveTitleOrder(tabId, {order, offset} = {}) {
  const date = await getDate(tabId);
  return new Promise((res) => {
    chrome.storage.local.get('webtoonOrder', function(data) {
      let oldOrder = data.webtoonOrder || {};
      oldOrder[getWebtoonDay(date, offset)] = order;
      chrome.storage.local.set({ webtoonOrder: oldOrder });
      res(oldOrder)
    });
  })
}

async function openWebtoonsReading({urls, numOfChapters}) {
  return await new Promise(resolve => {
    chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT },function(tabs) {
      const tabUrls = tabs.map(t => t.url);
      const pages = urls.filter(u => !tabUrls.includes(u))
        .slice(0, numOfChapters);
      openPages(pages);
      resolve();
    });
  })
}

async function openWebtoonsDraggable({todayComics, offset}, {windowId, id}) {
  await saveTitleOrder(id, {order:todayComics, offset});
  chrome.tabs.onUpdated.addListener(
    await setupUpdateListener(todayComics, windowId)
  );
}

async function setupUpdateListener(webtoonPages = [], windowId = 0) {
  if(!webtoonPages.length || !Array.isArray(webtoonPages)) return;
  const {id} = await new Promise(res => {
    chrome.tabs.create({
      active: false,
      url: webtoonPages[0].link,
      windowId
    }, res);
  });
  const updateListener = async (tabId, {status}, tab) => {
    try {
      if(status !== "loading" || id !== tabId) return;
      if (!webtoonPages[0].hasOpenedChapter) {
        chrome.tabs.executeScript(tabId, { code: 'document.querySelector(".detail_body .detail_lst a").click();' });
        webtoonPages[0].hasOpenedChapter = true;
      } else {
        chrome.tabs.executeScript(tabId, { 
          code: `;(${(() => {
            [...document.querySelectorAll('.viewer_lst .viewer_img img')]
              .forEach(img => {
                img.src = img.dataset['url'];
              });
            window.scroll(0, 0);
          }).toString()})();
          `
         });
        webtoonPages.shift();
        chrome.tabs.onUpdated.removeListener(updateListener);
        chrome.tabs.onUpdated.addListener(
          await setupUpdateListener(webtoonPages, windowId)
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  return updateListener;
}

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    let res;
    switch (request.requestType) {
      case "openWebtoonsReading":
        res = openWebtoonsReading(request.data);
        break;
      case "hasWebtoonDraggable":
        res = openWebtoonsDraggable(request.data, sender.tab);
        break;
      default:
        return;
    }
    res.then(sendResponse);

    return true;
  }
);