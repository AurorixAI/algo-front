// Browser regression of real ALGO pages with synthetic HTTP fixtures only.
const fs=require('node:fs'), assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base=process.env.QA_BASE||'http://127.0.0.1:3311', label=process.env.QA_LABEL||'candidate';
const root=process.env.QA_OUTPUT || require('node:path').join(process.cwd(),'.qa','math-layout');
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local frontend: all HTTP data are synthetic.');
fs.mkdirSync(root,{recursive:true});
const expressions=[
 '$$\\int_{-\\frac{\\pi}{2}}^{\\frac{\\pi}{2}}\\sin x\\,dx,\\quad\\Delta x=\\frac{\\pi}{20}$$',
 '$$\\sqrt{\\frac{1+\\sqrt{x}}{\\frac{1}{2}+x^2}}+x^{\\frac{3}{2}}$$',
 '$$\\left\\{\\begin{aligned}\\frac{x^2+1}{2}&=y\\\\\\sqrt{\\frac{y+1}{3}}&=x\\end{aligned}\\right.$$',
 '$$'+Array.from({length:22},(_,i)=>`\\frac{x^{${i+1}}}{${i+1}}`).join('+')+'$$',
];
expressions.push("$$\\begin{pmatrix}\\frac{x^{1}}{1} & \\frac{x^{2}}{2} & \\frac{x^{3}}{3} & \\frac{x^{4}}{4} & \\frac{x^{5}}{5} & \\frac{x^{6}}{6} & \\frac{x^{7}}{7} & \\frac{x^{8}}{8} & \\frac{x^{9}}{9} & \\frac{x^{10}}{10} & \\frac{x^{11}}{11} & \\frac{x^{12}}{12} & \\frac{x^{13}}{13} & \\frac{x^{14}}{14} & \\frac{x^{15}}{15} & \\frac{x^{16}}{16} & \\frac{x^{17}}{17} & \\frac{x^{18}}{18} & \\frac{x^{19}}{19} & \\frac{x^{20}}{20} & \\frac{x^{21}}{21} & \\frac{x^{22}}{22} & \\frac{x^{23}}{23} & \\frac{x^{24}}{24}\\\\\\frac{x^{1}}{1} & \\frac{x^{2}}{2} & \\frac{x^{3}}{3} & \\frac{x^{4}}{4} & \\frac{x^{5}}{5} & \\frac{x^{6}}{6} & \\frac{x^{7}}{7} & \\frac{x^{8}}{8} & \\frac{x^{9}}{9} & \\frac{x^{10}}{10} & \\frac{x^{11}}{11} & \\frac{x^{12}}{12} & \\frac{x^{13}}{13} & \\frac{x^{14}}{14} & \\frac{x^{15}}{15} & \\frac{x^{16}}{16} & \\frac{x^{17}}{17} & \\frac{x^{18}}{18} & \\frac{x^{19}}{19} & \\frac{x^{20}}{20} & \\frac{x^{21}}{21} & \\frac{x^{22}}{22} & \\frac{x^{23}}{23} & \\frac{x^{24}}{24}\\end{pmatrix}$$");
const inlineFraction='$\\dfrac{v^2s-v(v^2-v_1v_2)t}{v_1v_2}$';
const tasks=expressions.map((formula,i)=>({task_id:'UI-TALL-'+i,question_text:'LEGACY_SOURCE_MUST_NOT_DISPLAY',question_latex:'Проверка отображения формулы. '+formula,skill_name:'Синтетический render fixture',difficulty:'medium',answer_type:'choice',options:['0',expressions[1],'1',inlineFraction],options_latex:['$0$',expressions[1],'$1$',inlineFraction],correct_answer:'0',distractor_meta:[]}));
let selected=0,role='teacher';
const result={frontendRevision:process.env.GITHUB_SHA || process.env.QA_REVISION || 'local-working-tree',scope:'Local frontend with synthetic intercepted HTTP data; geometry and visible glyphs, not bank/math/authorization acceptance',label,base,checks:[],optionChecks:[],pageErrors:[],unhandledAPI:[]};
function payload(path){
 if(path==='/api/v1/auth/me')return{id:'UI-STAFF',role,org_role:role,first_name:'Проверка',last_name:'Отображения',org_id:'UI-ORG'};
 if(path==='/api/v1/auth/org/diagnostics/UI-INVITE')return{id:'UI-INVITE',student_id:'UI-STUDENT',session_id:'UI-SESSION',student_name:'Синтетический профиль',class_level:11,code:'UI-QA',status:'completed',student_status:'prospective'};
 if(path==='/api/v1/auth/org/students/UI-STUDENT/profile')return{student:{id:'UI-STUDENT',status:'prospective',first_name:'Проверка',last_name:'UI',class_level:11},group:null,teacher:null};
 if(path==='/api/v1/analytics/students/UI-STUDENT/report')return{session_id:'UI-SESSION',report_generation:{status:'ready'},narrative_ru:'Синтетические данные проверки отображения.',report_json:{report_meta:{session_id:'UI-SESSION',student_name:'Проверка UI',class_level:11,test_code:'UI-QA',date:'2026-10-04',total_questions:tasks.length,questions_correct:0,score_percent:0},overall:{score_percent:0,status:'below_level',status_label_ru:'Ниже уровня класса'},strong_skills:[],weak_skills:[],critical_gaps:[],root_cause_chains:[],cognitive_error_types:[],action_plan:[],error_patterns:[tasks[tasks.length-1],...tasks.slice(0,-1)].map(t=>({...t,skill_id:'UI-SKILL',skill_name_ru:t.skill_name,student_answer:'1',correct_answer_latex:expressions[1],eval_category:'wrong',answer_options:t.options,answer_options_latex:t.options_latex}))}};
 if(path.startsWith('/api/v1/auth/diagnostic/'))return{status:'in_progress',student_id:'UI-STUDENT',class_level:11,first_name:'Синтетический',last_name:'Профиль'};
 if(path==='/api/v1/diagnostic/sessions/by-invite')return{session_id:'UI-SESSION',status:'active',items_answered:0,total_time_ms:0,current_task:{...tasks[selected],answer_options:tasks[selected].options,answer_options_latex:tasks[selected].options_latex,phase:'measurement',items_answered:0,items_max:42,is_deep_scan:false,skill_id:'UI-SKILL',topic_id:'UI-TOPIC',hints:[]}};
 if(path==='/api/v1/exams/by-code/UI-EXAM')return{title:'Проверка отображения',teacher_name:'Синтетический преподаватель',subject:'Математика',status:'active',total_time_minutes:45,tasks_per_variant:tasks.length,variants_count:1};
 if(path.endsWith('/by-code/UI-EXAM/start'))return{session_id:'UI-EXAM-SESSION',session_token:'synthetic-render-only',variant_number:1,status:'in_progress',time_minutes:45,tasks:tasks.map(t=>({...t,text:t.question_text}))};
 if(path.includes('session-status'))return{status:'in_progress',time_remaining_seconds:2700};
 if(path.includes('/progress'))return{ok:true,answered_count:0};
 const draft={exam_id:'UI-EXAM',id:'UI-EXAM',title:'Проверка высоких формул',status:'draft',delivery_mode:'online',group_name:'Проверочная группа',group_id:'UI-GROUP',teacher_name:'Синтетический преподаватель',class_level:11,variants:[{variant_number:1,tasks}],settings:{},total_time_minutes:45,variants_count:1,tasks_per_variant:tasks.length,skills_covered:[],created_at:'2026-10-04T00:00:00Z',lifecycle_events:[]};
 if(path.endsWith('/exams/UI-EXAM/draft')||path.endsWith('/admin/exams/UI-EXAM/view'))return draft;
 if(path.endsWith('/exams/UI-EXAM/sessions'))return[];
 if(path.endsWith('/exams/UI-EXAM/lobby-status'))return{connected_count:0,students:[]};
 if(path.endsWith('/exams/UI-EXAM/analytics'))return{};
 if(path.endsWith('/exams/UI-EXAM/report'))return{...draft,status:'closed',total_students:1,submitted_count:1,avg_score_pct:0,pass_rate_pct:0,task_analytics:tasks.map(t=>({...t,attempts:1,correct_count:0,wrong_count:1,correct_rate:0})),top_errors:[],narrative_generated:true,is_final:true,narrative_ru:JSON.stringify({summary:'Проверка отображения без изменения банка.',strengths:[],critical_gaps:[],problem_tasks_analysis:tasks.map(t=>({...t,task_title:t.skill_name,error_rate_pct:100,misconception:'Синтетическое объяснение.',teacher_advice:'Проверить формулу.'})),lesson_plan:{}})};
 if(path.includes('/schedule')||path.endsWith('/groups')||path.endsWith('/profile'))return[];
 return undefined;
}
async function geometry(page,surface,width){
 await page.evaluate(()=>document.fonts.ready); await page.waitForTimeout(1000);
 const g=await page.evaluate(()=>{
  const math=[...document.querySelectorAll('.math-renderer')];const clips=[];let glyphs=0;const rowOverlaps=[];
  for(const renderer of math){
   for(const html of renderer.querySelectorAll('.katex-html')){
    const walker=document.createTreeWalker(html,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
     const node=walker.currentNode;if(!node.textContent.trim())continue;
     const range=document.createRange();range.selectNodeContents(node);const rect=range.getBoundingClientRect();if(!rect.width||!rect.height)continue;glyphs++;
     for(let a=node.parentElement;a&&a!==document.body;a=a.parentElement){
      const style=getComputedStyle(a);if(!['hidden','auto','scroll','clip'].includes(style.overflowY))continue;
      const ar=a.getBoundingClientRect();const top=ar.top+a.clientTop,bottom=top+a.clientHeight;
      const overTop=top-rect.top,overBottom=rect.bottom-bottom;
      if(overTop>2||overBottom>2){clips.push({text:node.textContent.slice(0,12),ancestor:a.className,overTop:Math.round(overTop*100)/100,overBottom:Math.round(overBottom*100)/100});break;}
     }
    }
   }
  }
  for(const display of document.querySelectorAll('.katex-display > .katex > .katex-html')){
   const bases=[...display.children].filter(e=>e.classList.contains('base')).map(e=>{
    const box=e.getBoundingClientRect();const w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let top=Infinity,bottom=-Infinity;while(w.nextNode()){if(!w.currentNode.textContent.trim())continue;const r=document.createRange();r.selectNodeContents(w.currentNode);const b=r.getBoundingClientRect();top=Math.min(top,b.top);bottom=Math.max(bottom,b.bottom);}return{box,top,bottom};
   });
   for(let i=0;i<bases.length;i++)for(let j=i+1;j<bases.length;j++){const a=bases[i],b=bases[j];if(b.box.top>a.box.top+5&&Math.min(a.box.right,b.box.right)-Math.max(a.box.left,b.box.left)>2&&a.bottom>b.top+2)rowOverlaps.push({overlap:a.bottom-b.top});}
  }
  return{rowOverlapCount:rowOverlaps.length,rowOverlaps,viewport:document.documentElement.clientWidth,pageWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,renderers:math.length,glyphs,mathErrors:document.querySelectorAll('.katex-error').length,legacyVisible:document.body.innerText.includes('LEGACY_SOURCE_MUST_NOT_DISPLAY'),verticalClips:clips.slice(0,40),verticalClipCount:clips.length};
 });
 {
  g.canScrollToEnd=await page.evaluate(()=>{
   const scrollers=[...document.querySelectorAll('.math-renderer, .katex-display')].filter(e=>e.scrollWidth>e.clientWidth+5 && getComputedStyle(e).overflowX==='auto');
   if(!scrollers.length)return true;
   return scrollers.every(e=>{e.scrollLeft=e.scrollWidth; const reached=e.scrollLeft>0&&Math.abs(e.scrollWidth-e.clientWidth-e.scrollLeft)<2;e.scrollLeft=0;return reached;});
  });
 }
 const extra=await page.evaluate(()=>({
  horizontalScrollers:[...document.querySelectorAll('.math-renderer,.katex-display')].filter(e=>e.scrollWidth>e.clientWidth+5&&getComputedStyle(e).overflowX==='auto').length,
  rawTeXVisible:[...document.querySelectorAll('.math-renderer')].some(e=>/\\(?:begin|end|frac|left|right|sqrt)\b/.test(e.innerText)),
  matrixRendered:[...document.querySelectorAll('.katex .mtable')].some(e=>e.querySelectorAll('.mfrac').length===48)
 }));
 Object.assign(g,extra);
 result.checks.push({surface,width,...g});
 console.log(JSON.stringify({surface,width,rowOverlaps:g.rowOverlapCount,renderers:g.renderers,clips:g.verticalClipCount,mathErrors:g.mathErrors,pageWidth:g.pageWidth}));
 if(width===360||surface==='diagnostic-integral')await page.screenshot({path:`${root}/p09-${label}-${surface}-${width}.png`,fullPage:true,animations:'disabled'});
}

// ── Option cards with a very wide formula (FE-2): student flow /d/ui-wide, synthetic HTTP only ────────────────
// The route handler mirrors the harness style (headers, fulfill) and COUNTS the POSTs: two-step selection must
// submit exactly once, and a pan / a scrollbar press must never count as a tap on the option.
const wideMatrix='$$\\begin{pmatrix}'+Array.from({length:44},(_,i)=>`\\frac{x^{${i+1}}}{${i+1}}`).join(' & ')+'\\end{pmatrix}$$';
const wideTask=n=>({task_id:'UI-WIDE-'+(n+1),skill_id:'UI-SKILL',topic_id:'UI-TOPIC',question_text:'Выберите верную запись.',question_latex:'Выберите верную запись $f(x)$.',question_image_url:null,answer_type:'multiple_choice',answer_options:['Широкая матрица','x в квадрате','корень из x','единица на x'],answer_options_latex:[wideMatrix,'$x^2$','$\\sqrt{x}$','$\\frac{1}{x}$'],hints:[],phase:'measurement',items_answered:n,items_max:3,is_deep_scan:false});
function wideRoutes(state){
 return route=>{
  const request=route.request(),method=request.method(),path=new URL(request.url()).pathname;
  const headers={'access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':request.headers()['access-control-request-headers']||'content-type,x-diagnostic-invite-code','access-control-allow-methods':'GET,POST,OPTIONS'};
  const json=(body,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
  if(method==='OPTIONS')return route.fulfill({status:204,headers});
  if(path.startsWith('/api/v1/auth/diagnostic/'))return json({status:'confirmed',student_id:'UI-STUDENT',class_level:9,student_first_name:'Синтетический',student_last_name:'Ученик'});
  if(path==='/api/v1/diagnostic/sessions/by-invite')return state.created?json({session_id:'UI-OPT-SESSION',status:'active',items_answered:state.answered,total_time_ms:0,current_task:wideTask(state.answered)}):json({detail:{code:'SESSION_NOT_FOUND',message:'Попытка не найдена'}},404);
  if(path==='/api/v1/diagnostic/sessions'&&method==='POST'){state.created=true;state.createPosts++;return json({session_id:'UI-OPT-SESSION',first_task:wideTask(state.answered)});}
  if(path.endsWith('/UI-OPT-SESSION/answer')&&method==='POST'){state.answerPosts++;state.answers.push(request.postDataJSON().student_answer);state.answered++;const done=state.answered>=3;return json({is_correct:false,outcome:0,eval_category:'wrong',theta:0,se:1,next_task:done?null:wideTask(state.answered),session_completed:done});}
  if(path.endsWith('/UI-OPT-SESSION/report'))return json({session_id:'UI-OPT-SESSION',student_id:'UI-STUDENT',grade_level:9,overall_theta:0,overall_level:'at_grade',confidence_interval:[-1,1],topic_breakdown:{},weak_skills:[],recommended_start:null,items_total:3,report_generation:{status:'ready'}});
  state.unhandled.push(method+' '+path);return json({},404);
 };
}
async function openWide(browser,{width,hasTouch=false}){
 const state={created:false,answered:0,createPosts:0,answerPosts:0,answers:[],unhandled:[]};
 const context=await browser.newContext({viewport:{width,height:900},hasTouch});
 await context.route('**/api/v1/**',wideRoutes(state));
 context.on('page',p=>p.on('pageerror',e=>result.pageErrors.push(e.message)));
 const page=await context.newPage();
 await page.goto(base+'/d/ui-wide');
 await page.getByRole('button',{name:'Начать диагностику',exact:true}).click();
 await page.locator('button.glass-option').first().waitFor();
 await page.waitForTimeout(700);
 return {context,page,state,display:page.locator('button.glass-option .katex-display').first()};
}
const pendingOptions=page=>page.evaluate(()=>[...document.querySelectorAll('button.glass-option')].map(o=>o.classList.contains('selected')));
async function optionChecks(browser){
 for(const width of [360,1280]){
  // 1. the formula DOM is not rewritten by page re-renders (the page ticks every second): same node, same scroll offset
  {const {context,page,display}=await openWide(browser,{width});
   await display.evaluate(el=>{el.__mark='kept';el.scrollLeft=200;});
   await page.waitForTimeout(2300);
   const kept=await display.evaluate(el=>({mark:el.__mark||null,left:Math.round(el.scrollLeft),overflows:el.scrollWidth>el.clientWidth+3,fadeRight:el.hasAttribute('data-sh-right'),fadeLeft:el.hasAttribute('data-sh-left'),tabindex:el.getAttribute('tabindex')}));
   result.optionChecks.push({check:'memo-same-node',width,...kept});
   await context.close();}
  // 2. mouse: first tap = pending (no POST), second tap = exactly one POST; another option moves the mark without a POST
  {const {context,page,state,display}=await openWide(browser,{width});
   const box=await display.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
   await page.mouse.click(x,y);await page.waitForTimeout(250);
   const afterFirst={posts:state.answerPosts,pending:await pendingOptions(page)};
   const other=await page.locator('button.glass-option').nth(1).boundingBox();
   await page.mouse.click(other.x+other.width/2,other.y+other.height/2);await page.waitForTimeout(250);
   const afterOther={posts:state.answerPosts,pending:await pendingOptions(page)};
   await page.mouse.click(other.x+other.width/2,other.y+other.height/2);await page.waitForTimeout(900);
   result.optionChecks.push({check:'two-step-select',width,afterFirst,afterOther,postsAfterConfirm:state.answerPosts,answers:state.answers.slice(),unhandled:state.unhandled.slice()});
   await context.close();}
  // 3. a scrollbar press / drag / track click on a PENDING option never submits it
  {const {context,page,state,display}=await openWide(browser,{width});
   let box=await display.boundingBox();
   await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.waitForTimeout(250); // pending
   const geo=await display.evaluate(el=>({gutter:el.offsetHeight-el.clientHeight,cw:el.clientWidth,sw:el.scrollWidth,left:el.scrollLeft}));
   const rec={check:'scrollbar-never-submits',width,gutter:geo.gutter,skipped:null};
   if(geo.gutter>0){
    box=await display.boundingBox();
    const sy=box.y+box.height-geo.gutter/2,thumb=Math.max(20,geo.cw*geo.cw/geo.sw),tx=box.x+geo.left*geo.cw/geo.sw+thumb/2;
    await page.mouse.move(tx,sy);await page.mouse.down();await page.mouse.move(tx+Math.min(160,box.width/3),sy,{steps:8});await page.mouse.up();await page.waitForTimeout(250);
    rec.afterDrag={posts:state.answerPosts,pending:await pendingOptions(page),left:await display.evaluate(el=>Math.round(el.scrollLeft))};
    await page.mouse.click(box.x+4,sy);await page.waitForTimeout(250); // click on the track, left of the thumb
    rec.afterTrackClick={posts:state.answerPosts,pending:await pendingOptions(page)};
   }else rec.skipped=process.env.ALLOW_OVERLAY_SCROLLBARS==='1'?'overlay scrollbar: no gutter to press':null;
   box=await display.boundingBox();
   await page.mouse.click(box.x+box.width/2,box.y+box.height/3);await page.waitForTimeout(900); // a normal second tap on the formula
   rec.postsAfterNormalSecondTap=state.answerPosts;rec.answers=state.answers.slice();
   result.optionChecks.push(rec);await context.close();}
  // 4. keyboard: Tab visits only the option cards (never the formula inside), Enter twice submits once
  {const {context,page,state}=await openWide(browser,{width});
   await page.evaluate(()=>document.activeElement&&document.activeElement.blur&&document.activeElement.blur());
   const visited=[];
   for(let i=0;i<4;i++){await page.keyboard.press('Tab');visited.push(await page.evaluate(()=>{const a=document.activeElement;return{card:!!(a.matches&&a.matches('button.glass-option')),index:[...document.querySelectorAll('button.glass-option')].indexOf(a),inFormula:!!(a.closest&&a.closest('.math-renderer, .katex-display')&&!a.matches('button.glass-option'))};}));}
   await page.keyboard.press('Enter');await page.waitForTimeout(250);const afterEnter=state.answerPosts;await page.keyboard.press('Enter');await page.waitForTimeout(900);
   result.optionChecks.push({check:'tab-visits-cards',width,visited,postsAfterFirstEnter:afterEnter,postsAfterSecondEnter:state.answerPosts});
   await context.close();}
 }
// 5. touch: a horizontal pan inside the wide option scrolls it and selects nothing; a tap in the bottom strip of
 // the formula (where a mouse scrollbar would be) is a REAL tap for a finger: pending, then exactly one POST
 {const {context,page,state,display}=await openWide(browser,{width:360,hasTouch:true});
  const cdp=await context.newCDPSession(page),box=await display.boundingBox(),y=box.y+box.height/2,x0=box.x+box.width*0.85,x1=box.x+box.width*0.15;
  const leftBefore=await display.evaluate(el=>Math.round(el.scrollLeft));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y}]});
  for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+(x1-x0)*i/10,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(500);
  const rec={check:'touch-pan-no-select',width:360,leftBefore,left:await display.evaluate(el=>Math.round(el.scrollLeft)),postsAfterPan:state.answerPosts,pendingAfterPan:await pendingOptions(page)};
  const b2=await display.boundingBox(),clientH=await display.evaluate(el=>el.clientHeight),sx=b2.x+b2.width/2,sy=b2.y+Math.min(b2.height,clientH)-8; // 8px above the bottom edge of the CLIENT area (never inside a gutter)
  await page.touchscreen.tap(sx,sy);await page.waitForTimeout(250);
  rec.pendingAfterStripTap=await pendingOptions(page);rec.postsAfterStripTap=state.answerPosts;
  await page.touchscreen.tap(sx,sy);await page.waitForTimeout(900);
  rec.postsAfterSecondStripTap=state.answerPosts;rec.answers=state.answers.slice();result.optionChecks.push(rec);await context.close();}
}
async function main(){
 const browser=await chromium.launch({...(process.env.CHROME_EXECUTABLE_PATH ? {executablePath:process.env.CHROME_EXECUTABLE_PATH} : {}),headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addCookies([{name:'algo_auth_token',value:'synthetic-render-only',url:base,httpOnly:true}]);
  context.on('page',p=>p.on('pageerror',e=>result.pageErrors.push(e.message)));
  await context.route('**/api/v1/**',route=>{
   const headers={'access-control-allow-origin':base,'access-control-allow-credentials':'true','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   const path=new URL(route.request().url()).pathname,body=payload(path);
   if(body===undefined){result.unhandledAPI.push(path);return route.fulfill({status:404,headers,contentType:'application/json',body:'{}'});}
   return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();
  for(selected=0;selected<tasks.length;selected++){
   await page.goto(base+'/d/ui-tall-'+selected);await page.getByRole('button',{name:'Продолжить с вопроса 1',exact:true}).click();await page.locator('button.glass-option').first().waitFor();
   for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,['diagnostic-integral','diagnostic-root','diagnostic-system','diagnostic-wide','diagnostic-matrix'][selected],width);}
  }
  await page.goto(base+'/e/UI-EXAM');await page.getByPlaceholder('Иван Иванов').fill('Синтетический профиль');await page.getByRole('button',{name:'Начать экзамен',exact:true}).click();await page.getByRole('button',{name:'Приступить',exact:true}).click();await page.locator('button.glass-option').first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'exam-live',width);}
  await page.evaluate(()=>localStorage.clear());role='admin';await page.goto(base+'/admin/exams/UI-EXAM');await page.getByRole('button',{name:/Задания и варианты/}).click();await page.locator('.math-renderer').first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'admin-preview',width);}
  await page.evaluate(()=>localStorage.clear());role='teacher';await page.goto(base+'/teacher/exams/UI-EXAM');await page.getByRole('button',{name:/Задания и варианты/i}).click();await page.locator('.math-renderer').first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'teacher-draft',width);}
  await page.goto(base+'/teacher/exams/UI-EXAM/report');await page.getByRole('button',{name:/Разбор проблемных заданий/}).click();await page.getByText('Условие задания',{exact:true}).first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'teacher-report',width);}
  await page.evaluate(()=>localStorage.clear());role='admin';await page.goto(base+'/admin/diagnostics/UI-INVITE/report');await page.getByRole('tab',{name:/Журнал ошибок/}).click();await page.locator('.math-renderer').first().waitFor();
  for(const width of [360,768,1280]){await page.setViewportSize({width,height:900});await geometry(page,'diagnostic-report',width);}
  // The option-card checks need REAL scrollbars (headless Chromium hides them with --hide-scrollbars): the scrollbar
  // protection of the cards is only exercised when the scroller has a gutter. Own browser, the geometry checks above
  // keep the default launch.
  {const optionBrowser=await chromium.launch({...(process.env.CHROME_EXECUTABLE_PATH ? {executablePath:process.env.CHROME_EXECUTABLE_PATH} : {}),headless:true,ignoreDefaultArgs:['--hide-scrollbars']});
   try{await optionChecks(optionBrowser);}finally{await optionBrowser.close();}}
  if(label!=='before'){
   assert.equal(result.checks.length,30,'All six page surfaces and five formulas must be checked');
   assert.equal(result.pageErrors.length,0,JSON.stringify(result.pageErrors));
   assert.equal(result.unhandledAPI.length,0,JSON.stringify(result.unhandledAPI));
   assert.ok(result.checks.filter(c=>c.surface==='diagnostic-wide').every(c=>c.horizontalScrollers===0),'Breakable sum should wrap without scrolling');
   assert.ok(result.checks.filter(c=>c.surface==='diagnostic-matrix').every(c=>c.horizontalScrollers>0&&c.canScrollToEnd&&c.matrixRendered),'Indivisible matrix must render and scroll to its end');
   assert.ok(result.checks.filter(c=>['admin-preview','teacher-draft','teacher-report','diagnostic-report'].includes(c.surface)).every(c=>c.matrixRendered),'Matrix must render in previews and reports');
   const oc=(name,width)=>result.optionChecks.find(c=>c.check===name&&c.width===width);
   for(const width of [360,1280]){
    const memo=oc('memo-same-node',width);assert.ok(memo.overflows&&memo.mark==='kept'&&memo.left>=150,'the formula DOM must survive page re-renders with its scroll offset: '+JSON.stringify(memo));
    assert.ok(memo.fadeLeft&&memo.fadeRight,'a scrolled wide option fades on both sides');assert.equal(memo.tabindex,'-1','a formula inside a card is not a tab stop');
    const two=oc('two-step-select',width);assert.equal(two.afterFirst.posts,0);assert.equal(two.afterFirst.pending[0],true);assert.equal(two.afterOther.posts,0);assert.deepEqual(two.afterOther.pending,[false,true,false,false]);assert.equal(two.postsAfterConfirm,1);assert.deepEqual(two.answers,['x в квадрате']);assert.deepEqual(two.unhandled,[],'every request of the student flow is mocked');
    const bar=oc('scrollbar-never-submits',width);assert.ok(bar.gutter>0||bar.skipped,'the scrollbar gutter must exist in the option checks (browser launched with ignoreDefaultArgs --hide-scrollbars; set ALLOW_OVERLAY_SCROLLBARS=1 only on a runner that cannot show classic scrollbars)');if(!bar.skipped){assert.equal(bar.afterDrag.posts,0);assert.equal(bar.afterDrag.pending[0],true);assert.ok(bar.afterDrag.left>0,'the thumb drag scrolled the formula');assert.equal(bar.afterTrackClick.posts,0);assert.equal(bar.afterTrackClick.pending[0],true);}
    assert.equal(bar.postsAfterNormalSecondTap,1,'a normal second tap submits exactly once');assert.deepEqual(bar.answers,['Широкая матрица']);
    const tab=oc('tab-visits-cards',width);assert.ok(tab.visited.every((v,i)=>v.card&&!v.inFormula&&v.index===i),'Tab visits only the option cards, in order: '+JSON.stringify(tab.visited));assert.equal(tab.postsAfterFirstEnter,0);assert.equal(tab.postsAfterSecondEnter,1);
   }
   const touch=oc('touch-pan-no-select',360);assert.ok(touch.left>touch.leftBefore,'a touch pan scrolls the wide option: '+JSON.stringify(touch));assert.equal(touch.postsAfterPan,0);assert.ok(touch.pendingAfterPan.every(v=>!v),'a pan selects nothing');assert.equal(touch.pendingAfterStripTap[0],true,'a finger tap in the bottom strip of the formula is a tap');assert.equal(touch.postsAfterStripTap,0);assert.equal(touch.postsAfterSecondStripTap,1);assert.deepEqual(touch.answers,['Широкая матрица']);
   assert.ok(result.checks.every(c=>c.mathErrors===0&&!c.legacyVisible&&c.renderers>0&&c.glyphs>0&&c.pageWidth<=c.viewport+1&&c.bodyWidth<=c.viewport+1&&c.verticalClipCount===0&&c.rowOverlapCount===0&&!c.rawTeXVisible),'Visible geometry/overflow regression failed');
  }
 }finally{fs.writeFileSync(`${root}/p09-${label}-math-surfaces-2026-10-04.json`,JSON.stringify(result,null,2)+'\n');await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
