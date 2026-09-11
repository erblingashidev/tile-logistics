import { STALE_ASSET_RELOAD_KEY } from "@/lib/client-recovery";

/** Inline head script: runs even if Next.js chunks fail to load. */
export const STALE_ASSET_RECOVERY_SCRIPT = `(function(){
  var key=${JSON.stringify(STALE_ASSET_RELOAD_KEY)};
  function flagged(){try{return sessionStorage.getItem(key)==="1"}catch(e){return false}}
  function flag(){try{sessionStorage.setItem(key,"1")}catch(e){}}
  function isNext(url){return typeof url==="string"&&url.indexOf("/_next/static/")!==-1}
  function reloadOnce(){if(flagged())return;flag();location.reload()}
  window.addEventListener("error",function(event){
    var t=event.target;
    if(!t||t===window)return;
    var url=t.src||t.href||"";
    if(isNext(url))reloadOnce();
  },true);
  window.addEventListener("unhandledrejection",function(event){
    var msg=String((event.reason&&event.reason.message)||event.reason||"");
    if(/chunk|dynamically imported module|Importing a module script failed/i.test(msg))reloadOnce();
  });
  window.addEventListener("pageshow",function(event){if(event.persisted)location.reload()});
})();`;
