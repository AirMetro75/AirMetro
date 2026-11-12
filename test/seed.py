import json,random,time,urllib.request,re
src=open('public/stations.js',encoding='utf-8').read()
D=json.loads(src[src.index('{'):src.rindex('}')+1])
random.seed(3);now=int(time.time());V=[]
for s in D['s']:
    for l in s[3].split(','):
        if random.random()<0.5: continue
        for k in range(random.randint(1,4)):
            base=12+random.random()*45+(12 if l in('1','4','11','13') else 0)
            V.append(dict(t=now-random.randint(0,25)*86400-random.randint(0,40000),name=s[0],line=l,c=random.randint(4,40),a=round(base,1),b=round(base*1.8,1),x=round(base*1.5,1),tp=22.5,hu=44,pr=1011))
for i in range(0,len(V),100):
    r=urllib.request.Request('http://localhost:8790/api/upload',json.dumps({'visits':V[i:i+100]}).encode(),{'Content-Type':'application/json','X-Key':'secret-test'})
    print(urllib.request.urlopen(r).read().decode())
