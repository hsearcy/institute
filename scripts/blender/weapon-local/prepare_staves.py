"""Remove three measured background inclusions before staff triangulation."""
import cv2,numpy as np
from trace_concept import trace

def corrected(item):
 def edit(mask):
  if item=='wintercrown':
   # Open background between the highest tine and right outer tine.
   cv2.fillPoly(mask,[np.array([(141,116),(174,116),(167,142),(164,176),(158,207),(143,234),(135,248),(141,219),(143,184),(143,150)],np.int32)],0)
   # Ground shadow beyond the bottom point.
   mask[940:,108:]=0
   mask[950:]=0
  elif item=='phoenix':
   mask[903:,:176]=0
   mask[910:]=0
  elif item=='moonstaff':
   # Original pendant is a crescent ring with an open center.
   cv2.ellipse(mask,(127,337),(7,10),0,0,360,0,-1)
   mask[889:,:94]=0
  return mask
 return edit

if __name__=='__main__':
 for item in ('wintercrown','phoenix','moonstaff'):trace(item,corrected(item))
