import os, sys, glob, shutil, time
import numpy as np, cv2, onnxruntime as ort

ROOT='/home/maheshkoria/mustang-build/assets'
MODEL='/home/maheshkoria/mustang-build/models/depth-anything-v2-small.onnx'
sess=ort.InferenceSession(MODEL,providers=['CPUExecutionProvider'])
inp=sess.get_inputs()[0]
ISH=inp.shape
H=int(ISH[1]) if isinstance(ISH[1],int) else 518
W=int(ISH[2]) if isinstance(ISH[2],int) else 518
MEAN=np.array([0.485,0.456,0.406],dtype=np.float32)
STD=np.array([0.229,0.224,0.225],dtype=np.float32)

def depth_of(img):
    rgb=cv2.cvtColor(img,cv2.COLOR_BGR2RGB)
    # model input must be multiple-of-14 both dims (patch grid) — 518 works
    r=cv2.resize(rgb,(518,518),interpolation=cv2.INTER_AREA)
    x=((r.astype(np.float32)/255.0)-MEAN)/STD
    x=x.transpose(2,0,1)[None].astype(np.float32)
    d=sess.run(None,{inp.name:x})[0].squeeze()
    d=(d-d.min())/(d.max()-d.min()+1e-8)
    return d

dirs=[
 ('seq-1m','depth/seq-1m'),
 ('seq-2m','depth/seq-2m'),
 ('seq-3m','depth/seq-3m'),
 ('seq-4m','depth/seq-4m'),
 # desktop 1280w: same 518 inference upscaled to desktop res
 ('seq-1','depth/seq-1'),
 ('seq-2','depth/seq-2'),
 ('seq-3','depth/seq-3'),
 ('seq-4','depth/seq-4'),
]

t0=time.time()
for src,dst in dirs:
    os.makedirs(dst,exist_ok=True)
    files=sorted(glob.glob(os.path.join(ROOT,src,'f_*.jpg')))
    print(f'== {src}: {len(files)} frames', flush=True)
    for i,f in enumerate(files):
        out=os.path.join(ROOT,dst,os.path.basename(f).replace('.jpg','.png'))
        if os.path.exists(out): continue
        img=cv2.imread(f)
        d=depth_of(img)
        u=(d*65535).astype(np.uint16)
        u=cv2.resize(u,(img.shape[1],img.shape[0]),interpolation=cv2.INTER_CUBIC)
        cv2.imwrite(out,u)
        if i%40==0: print(f'   {i}/{len(files)} ({time.time()-t0:.0f}s)', flush=True)
print('ALL DEPTH DONE in %.0fs'%(time.time()-t0))