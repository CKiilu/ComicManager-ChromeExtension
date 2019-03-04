import {get as httpGet} from 'axios';

chrome.runtime.onMessage.addListener(
  async function(request,sender,sendResponse){
    let res;
    switch(request.requestType){
      case "novelUpdatesOpenPage":
        res = novelUpdatesOpenPage(request.data, sender);
        break;
      case "novelUpdatesOpenPageWayback":
        res = novelUpdatesOpenPageWayback(request.data, sender);
        break;
      case "novelUpdatesOpenPageNext":
        res = novelUpdatesOpenPageNext(request.data, sender);
        break;
      case "novelUpdatesBGNext":
        res = novelUpdatesBGNext({...request.data, current:sender.tab});
        break;
      case "novelUpdatesRemoveFromStore":
        res = novelUpdatesRemoveFromStore({...request.data, current:sender.tab});
        break;
      case "replaceMonitorNovelUpdatesUrl":
        res = replaceMonitorNovelUpdatesUrl({...request.data, current: sender.tab});
        break;
      case "novelUpdatesOpenParent":
        res = novelUpdatesOpenParent(request.data, sender);
        break;
      case "novelUpdatesSaveUrl":
        res = novelUpdatesSaveUrl(request.data, sender);
        break;
      default:
        return;
    }
    res.then(sendResponse);
    return true;
  }
);

function getTabIndex(selectFunc, clampFunc){
  return async (tab, offset = 1) => { 
    let index =  tab.index + offset;
    const novels = await getNovels();
    const parentURL = tab.url.match(/.*\//)[0] + "*";
    if(novels.hasOwnProperty(parentURL)){
      const tabs = await new Promise(res => {
        chrome.tabs.query({}, res)
      });
      const urls = novels[parentURL].map(({url}) => url);
      for(const tab of tabs){
        if(urls.includes(tab.url)){
          index = selectFunc(index, tab.index + offset);
        }
      }
      index = clampFunc(index);
    }
  
    return index;
  }
}

const getMaxTabIndex = getTabIndex(Math.max, x => x);
const getMinTabIndex = getTabIndex(Math.min, Math.max.bind(null, 0));
const novelUrlMatch = (ch, tab) => new RegExp(ch.replace(/\?/g, "\\?") + '/?$').test(tab);

async function novelUpdatesSaveUrl({url, parent, wayback}, sender){
  return await saveCurrentNovelTab(parent, {url}, wayback)
}

async function novelUpdatesOpenParent({page}, sender){
  const index = await getMinTabIndex({
    url: page,
    index: 1000
  }, 0);
  return await new Promise(resolve => {
    chrome.tabs.create({
      url: page,
      windowId: sender.tab.windowId,
      active: false,
      index
    }, resolve);
  });
}

async function replaceMonitorNovelUpdatesUrl({current, parent, url, wayback}){
  const {url:u} = await fetch(url, {method: 'HEAD'});
  await deleteCurrentNovelTab(parent, current);
  await saveCurrentNovelTab(parent, {url:u}, wayback);
  return await new Promise(res => {
    chrome.tabs.update(current.id, {url:u}, res);
  })
}

async function novelUpdatesOpenPageNext(options, sender){
  const openFunc = options.wayback ? novelUpdatesOpenPageWayback : novelUpdatesOpenPage;
  return openFunc(options, {
    tab: {
      windowId: sender.tab.windowId,
      ...options.parent
    },
  });
}

async function novelUpdatesOpenPage(options, sender) {
  const newTabData = {};
  const {url} = await fetch(options.url, {method: 'HEAD'});
  if(options.save){
    newTabData.index = await getMaxTabIndex(sender.tab);    
    await saveCurrentNovelTab(sender.tab, {url}, options.wayback);
  }

  return await new Promise(res => {
    chrome.tabs.create({
      url,
      active: false,
      windowId: sender.tab.windowId,
      ...newTabData
    },res);
  });;
}

function novelUpdatesOpenPageWayback(options, sender){  
  return httpGet(`https://comic-manager.herokuapp.com?url=${options.url}`).then(({data}) => {
    const {closest} = data;
    if(closest){
      return novelUpdatesOpenPage({...options, url: closest.url}, sender);
    } else {
      throw new Error('Url not available on wayback machine');
    }
  }).catch(e => {
    console.error(e);
    if(e.response){
      console.error(e.response.data);
    }
  });
}

function novelUpdatesBGNext(options) {
  return new Promise(res => {
    chrome.tabs.sendMessage(options.parent.id, {
      requestType: "novelUpdatesUINext",
      data: {
        wayback: options.wayback,
        tabId: options.tabId,
        save: options.save
      }
    }, () => {
      res(options);
    });
  }).then(novelUpdatesRemoveFromStore);
}

function novelUpdatesRemoveFromStore(options) {
  return new Promise(res => {
    chrome.tabs.remove(options.current.id, res);
  }).then(_ => deleteCurrentNovelTab(options.parent, options.current))
}

function saveCurrentNovelTab(parent, current, wayback) {
  return new Promise(res => {
    chrome.storage.local.get("novels", function (data) {
      let novels = data.novels || {};
      let key = parent.url.match(/.*\//)[0] + "*";
      let val = {
        url: current.url,
        time: Date.now(),
        wayback: !!wayback,
        page: parent.url
      };
      if(novels[key]){
        novels[key].push(val);
      } else {
        novels[key] = [val];
      }
      chrome.storage.local.set({novels: novels});
      res();
    });
  })
}

function deleteCurrentNovelTab(parent, current) {
  return new Promise(res => {
    chrome.storage.local.get("novels", function (data) {
      let novels = data.novels || {};
      let key = parent.url.match(/.*\//)[0] + "*";
      if(novels[key]){
        novels[key] = novels[key].filter(n => !novelUrlMatch(n.url, current.url));
        if(novels[key].length === 0){
          delete novels[key];
        }
      }
      chrome.storage.local.set({novels: novels});
      res();
    });
  })
}

function getNovels(){
  return new Promise(res => 
    chrome.storage.local.get("novels", function ({novels = {}} = {}) {
      res(novels);
    })
  );
}

function filterOutWeekOldNovels(novels = [], data = []){
  if(novels.length === 0) return data;
  const novel = novels.shift();
  if(Date.now() - novel.time < 259200000){
    // 3 days not passed since item was added to the monitor
    data.push(novel);
  }

  return filterOutWeekOldNovels(novels, data);
}

function cleanNovels(novels = {}, data = {}){
  const novelKeys = Object.keys(novels);
  if(novelKeys.length === 0) return Object.freeze(data);
  const key = novelKeys[0];
  if(novels.hasOwnProperty(key)){
    const novelChapters = filterOutWeekOldNovels(novels[key])
      .filter(n => n.url);
    delete novels[key];
    if(novelChapters.length !== 0 ){
      data[key] = novelChapters;
    }
  }

  return cleanNovels(novels, data);
}

chrome.tabs.onUpdated.addListener(
  function check(tabId, {status}, tab) {
    return async function(){
      if(status){
        const novels = await getNovels();
        if(Object.keys(novels).length === 0){
          return;
        }
        const cleanedNovels = cleanNovels(novels);
        chrome.storage.local.set({novels: cleanedNovels});
        const tabs = await new Promise(res => {
          chrome.tabs.query({url: 'https://www.novelupdates.com/series/*'}, res);
        });
        for(const key in cleanedNovels){
          const novel = cleanedNovels[key].find(ch => novelUrlMatch(ch.url, tab.url));
          if(novel){
            const parent = tabs.find(t => new RegExp(key.replace('*', '.*')).test(t.url));
            const {name} = chrome.runtime.getManifest();
            if(status === "complete"){
              chrome.tabs.sendMessage(tab.id, {
                requestType: "monitorNovelUpdates",
                data: {
                  parent: parent || {url: novel.page},
                  tabId: tab.id,
                  ...novel
                },
                extensionName: name
              });
            } else if(status === "loading") {
              chrome.tabs.executeScript(tab.id, {
                code: `window.postMessage({
                  extension: "${name}",
                  status: "loading" 
                }, window.location.href);`
              });
            }
            return;
          }
        }
      } 
    }().catch(console.error);
  }
);

chrome.runtime.onInstalled.addListener(
  function(details){
    chrome.tabs.query({url:'https://www.novelupdates.com/series/*'}, function(tabs){
      for (let i = 0; i < tabs.length; i++) {
        chrome.tabs.reload(tabs[i].id)
      }
    });

  
  chrome.storage.local.get("novels", async function ({novels}) {
    const tabs =  await new Promise(res => {
      chrome.tabs.query({}, res);
    });

    Object.values(novels).forEach(novel => {
      tabs.forEach(tab => {
        if(novel.find(({url}) => novelUrlMatch(url, tab.url))){
          chrome.tabs.reload(tab.id);
        }
      })
    })
  });
})