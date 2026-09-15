(function(){
  "use strict";
  const n=(v,d=0)=>{const x=Number(String(v??"").replace(",","."));return Number.isFinite(x)?x:d};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const normalize=a=>{const s=a.reduce((x,y)=>x+y,0);return s>0?a.map(x=>x/s):a.map(()=>1/Math.max(1,a.length))};
  function randn(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}
  function gamma(shape){if(shape<=0)return 0;if(shape<1)return gamma(shape+1)*Math.pow(Math.random(),1/shape);const d=shape-1/3,c=1/Math.sqrt(9*d);for(;;){let x=randn(),v=1+c*x;if(v<=0)continue;v=v*v*v;const u=Math.random();if(u<1-.0331*x*x*x*x)return d*v;if(Math.log(u)<.5*x*x+d*(1-v+Math.log(v)))return d*v}}
  const dirichlet=a=>normalize(a.map(x=>gamma(Math.max(.03,x))));
  function quantile(a,q){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),p=(s.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return l===h?s[l]:s[l]+(s[h]-s[l])*(p-l)}

  function compute(opts){
    const aggregate=opts.aggregate;
    if(!aggregate?.candidates?.length)return {available:false,reason:"Sem votos suficientes para calcular a projeção."};
    const office=String(opts.office||"");
    const turn=Number(opts.turn||1);
    const threshold=n(opts.threshold,10);
    const maxProgress=n(opts.maxProgress,60);
    const progress=n(aggregate.progress);
    if(["6","7","8"].includes(office))return {available:false,proportional:true,reason:"Deputados são eleitos pelo sistema proporcional. O painel exibe votos, situação e vagas do TSE, sem converter isso em uma probabilidade simplificada de vitória."};
    if(progress<threshold)return {available:false,reason:`A projeção começa em ${threshold}% de apuração. Atual: ${progress.toFixed(1)}%.`,progress};
    if(progress>maxProgress)return {available:false,closed:true,reason:`Projeção encerrada: a apuração ultrapassou ${maxProgress}%. A partir daqui o painel prioriza o resultado observado pelo TSE.`,progress};

    const cands=aggregate.candidates.slice(0,office==="5"?12:10);
    const keys=cands.map(c=>c.key||c.number||c.name);
    const currentVotes=cands.map(c=>n(c.votes));
    const currentValid=Math.max(n(aggregate.valid),currentVotes.reduce((a,b)=>a+b,0));
    const globalShares=normalize(currentVotes.map(v=>Math.max(v,.001)));
    const counted=n(aggregate.electorateCounted);
    const globalValidRate=counted>0?clamp(currentValid/counted,.25,.95):.72;
    const units=[];

    for(const su of (opts.units||[])){
      if(!su)continue;
      const rem=n(su.electorateRemaining,Math.max(0,n(su.electorateTotal)-n(su.electorateCounted)));
      if(rem<=0)continue;
      const map=new Map((su.candidates||[]).map(c=>[c.key||c.number||c.name,n(c.votes)]));
      const localVotes=keys.map(k=>map.get(k)||0);
      const localValid=Math.max(n(su.valid),localVotes.reduce((a,b)=>a+b,0));
      const p=clamp(n(su.progress)/100,0,1);
      let reliability=clamp(Math.sqrt(p)*.9,0,.93);
      if(localValid<400)reliability*=clamp(localValid/400,0,1);
      const localShares=localValid>0?normalize(localVotes.map(v=>Math.max(v,.001))):globalShares;
      const mean=normalize(localShares.map((v,i)=>reliability*v+(1-reliability)*globalShares[i]));
      const concentration=18+230*Math.pow(p,.72);
      const localCounted=n(su.electorateCounted);
      const localValidRate=localCounted>0&&localValid>0?clamp(localValid/localCounted,.25,.95):globalValidRate;
      units.push({rem,mean,concentration,validRateMean:clamp(p*1.25,0,.9)*localValidRate+(1-clamp(p*1.25,0,.9))*globalValidRate,validRateSd:.015+.055*(1-p)});
    }

    let aggRem=n(aggregate.electorateRemaining,Math.max(0,n(aggregate.electorateTotal)-n(aggregate.electorateCounted)));
    if(!units.length){
      if(aggRem<=0&&progress>0&&progress<100){const estimatedFinalValid=currentValid/(progress/100);aggRem=Math.max(0,(estimatedFinalValid-currentValid)/Math.max(globalValidRate,.4))}
      if(aggRem>0)units.push({rem:aggRem,mean:globalShares,concentration:25+150*(progress/100),validRateMean:globalValidRate,validRateSd:.04});
    }
    if(!units.length)return {available:false,reason:"Não há informação suficiente sobre o eleitorado ainda não totalizado para projetar."};

    const iterations=clamp(Math.round(n(opts.iterations,3000)),1000,7000);
    const win=Array(cands.length).fill(0),outright=Array(cands.length).fill(0),qualified=Array(cands.length).fill(0),samples=cands.map(()=>[]);
    let runoff=0;
    const senateSeats=office==="5"?clamp(Number(opts.senateSeats||1),1,2):1;

    for(let it=0;it<iterations;it++){
      const totals=[...currentVotes];
      for(const u of units){
        const validRate=clamp(u.validRateMean+randn()*u.validRateSd,.25,.95);
        const futureValid=Math.max(0,u.rem*validRate);
        const shares=dirichlet(u.mean.map(m=>Math.max(.03,m*u.concentration)));
        for(let i=0;i<totals.length;i++)totals[i]+=futureValid*shares[i];
      }
      const total=totals.reduce((a,b)=>a+b,0)||1;
      const order=totals.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v);
      win[order[0].i]++;
      if(office==="5"){
        for(let s=0;s<Math.min(senateSeats,order.length);s++)qualified[order[s].i]++;
      }else if(turn===1){
        const leadShare=order[0].v/total;
        if(leadShare>.5)outright[order[0].i]++;
        else{runoff++;if(order[0])qualified[order[0].i]++;if(order[1])qualified[order[1].i]++}
      }else qualified[order[0].i]++;
      for(let i=0;i<totals.length;i++)samples[i].push(100*totals[i]/total);
    }

    const results=cands.map((c,i)=>({
      ...c,
      leadProbability:100*win[i]/iterations,
      firstRoundWinProbability:100*outright[i]/iterations,
      qualificationProbability:100*qualified[i]/iterations,
      expectedShare:samples[i].reduce((a,b)=>a+b,0)/(samples[i].length||1),
      low90:quantile(samples[i],.05),high90:quantile(samples[i],.95)
    }));
    const sortMetric=office==="5"?"qualificationProbability":(turn===1?"firstRoundWinProbability":"leadProbability");
    results.sort((a,b)=>b[sortMetric]-a[sortMetric]);
    let confidence="baixa";if(progress>=20)confidence="moderada";if(progress>=40)confidence="alta";
    return {available:true,progress,iterations,unitsUsed:units.length,confidence,results,runoffProbability:office!=="5"&&turn===1?100*runoff/iterations:null,senateSeats,office,turn,model:"Monte Carlo geográfico ponderado pelo eleitorado ainda não totalizado."};
  }
  window.ElectionProjection={compute};
})();
