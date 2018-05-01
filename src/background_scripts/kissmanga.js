'use strict';

import {createTab, kissmangaMatchChapter} from '../shared';

export function openKissmangaChapter(offset = 0) {
  chrome.tabs.query({
      'windowId': chrome.windows.WINDOW_ID_CURRENT
  }, async function(tabs) {
      tabs = tabs.filter((t) => t.url && /.*kissmanga.com\/Manga\/[^\/]+$/.test(t.url));
      let numOfChapters = 0;
      for (let i = 0; i < tabs.length; i++) {
        let {id} = tabs[i];
        let {comicsAreExcess, len} = await new Promise((res) => {
          chrome.tabs.sendMessage(id, {requestType: "kissmangaOpenDay", data: {offset,id,onlyTab:(tabs.length == 1), numOfChapters}}, res);
        });
        numOfChapters += len;
        if(comicsAreExcess)
          return;
      }
  });
}

function getNextChapterDetailsKissmanga(tab){
  return new Promise(res => {
    const {url, title, id} = tab;
    const parentURL = url.slice(0, url.lastIndexOf('/') + 1);
    let {chapter:greatestChapter, volume: greatestVolume} = kissmangaMatchChapter(title);
    if(greatestChapter === null){
      return alert('Chapter could not be parsed from the title');
    }
    let greatestTabIndex = tab.index;
    chrome.tabs.query({url: parentURL + '*'}, tabs => {
      for(let i = 0; i < tabs.length; i++){
        const t = tabs[i];
        if(t.url + '/' !== parentURL){
          const {chapter: chapterFloat, volume} = kissmangaMatchChapter(t.title);
          if((
            volume && greatestVolume && volume > greatestVolume
          ) || chapterFloat && chapterFloat >  greatestChapter){
            greatestChapter = chapterFloat;
            greatestTabIndex = t.index;
            greatestVolume = volume;
          }
        }
      }

      res({greatestChapter, greatestTabIndex, parentURL, volume: greatestVolume});
    });
  }).catch(console.error);
}

export function openNextChaptersKissmanga(tab, {offset = 5}){
  return getNextChapterDetailsKissmanga(tab)
    .then(({greatestChapter, greatestTabIndex, parentURL, volume}) => {      
      chrome.tabs.sendMessage(tab.id, {
        requestType: "openNextChaptersKissmanga",
        data: {
          current: greatestChapter,
          index: greatestTabIndex,
          parentURL,
          offset,
          volume
        }
      });
    });
}

function getLastChapterKissmanga(tab, sendResponse){
  return getNextChapterDetailsKissmanga(tab)
    .then(({greatestChapter, greatestTabIndex, volume}) => {
      sendResponse({
        last: greatestChapter,
        index: greatestTabIndex,
        volume
      });
    });
}

async function kissmangaOpenPages(tab, {urls, current, willClose, index}){
  for (let i = 0; i < urls.length; i++) {
    await createTab({
      url: urls[i],
      index: index + i + 1,
    });
  }
  if(willClose){
    chrome.tabs.remove(tab.id);
  }
}

chrome.runtime.onMessage.addListener(
  function(request,sender,sendResponse){
    switch(request.requestType){
      case "kissmangaOpenPages":
        kissmangaOpenPages(sender.tab, request.data).catch(console.error);
        break;
      case "kissmangaOpenNext":
        openNextChaptersKissmanga(sender.tab, {
          offset: 1
        });
        break;
      case "getLastChapterKissmanga":
        getLastChapterKissmanga(sender.tab, sendResponse);
        return true;
    }
  }
);