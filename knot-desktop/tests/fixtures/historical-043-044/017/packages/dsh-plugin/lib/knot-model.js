/**
 * Knot Data Model
 * 核心数据结构：结（knot-node）和绳（knot-edge）
 * knot = 对话节点资产化的创意者工作台
 *
 * 阶段 3 P0：结 = 有序块序列 [b1, b2, ...]
 * 每块 { id, source, timestamp, provenance, content }
 * 追加=尾部增块；续长=以该结为 V_b 触发生成，输出块接尾。
 * title/summary 保持兼容：title=首块摘要或独立标题，summary=首块全文（折叠态用）。
 */

/** 结内块（Knot Block） */
                            
                           
             
                   
                                 
                     
                    
                                        
                       
            
                  
 

/**
 * 结（Knot Node）
 * 表示对话思考的原子单位，可资产化、可编排
 */
                           
             
               
         
               
                  
                               
                    
                      
                  
                    
                
                           
                     
                                  
                         
    
         
                 
               
                
                
      
    
 

/** 从 data 中取块序列（缺省时由 title/summary 合成 manual 双块，保证渲染恒有块可用） */
export const getBlocks = (data                  )              => {
  if (Array.isArray(data.blocks) && data.blocks.length > 0) return data.blocks;
  const ts = '1970-01-01T00:00:00.000Z';
  const blocks              = [];
  if (data.title) {
    blocks.push({ id: 'b_title', source: 'manual', timestamp: ts, provenance: [], content: data.title });
  }
  if (data.summary && data.summary !== data.title) {
    blocks.push({ id: 'b_summary', source: 'manual', timestamp: ts, provenance: [], content: data.summary });
  }
  return blocks;
};

/** 生成块 id（结内自增尾号，追加稳定） */
export const nextBlockId = (blocks             )         => {
  let max = 0;
  for (const b of blocks) {
    const m = /^b(\d+)$/.exec(b.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `b${max + 1}`;
};

/**
 * 绳（Knot Edge）
 * 表示结之间的连接，代表可运行的思考路径
 */
                           
                
                       
                
                       
                
                       
                
                       
                                          
                                                       
 

/**
 * Knot 文档（FlowGram 画布的数据容器）
 */
                                   
                    
                    
 

/**
 * Knot 示例工厂函数
 */
export const createKnotNode = (
  id        ,
  title        ,
  summary        ,
  token        ,
  src        ,
  chain_id        ,
  x        ,
  y        
)           => ({
  id,
  type: 'knot',
  data: { title, summary, token, src, chain_id },
  meta: { position: { x, y } },
});

export const createKnotEdge = (
  sourceNodeID        ,
  targetNodeID        ,
  sourcePortID         = 'out',
  targetPortID         = 'in'
)           => ({
  sourceNodeID,
  targetNodeID,
  sourcePortID,
  targetPortID,
});

/** 工作现场保存引用和输入状态；资产内容仍由 WorkflowDocument 持有。 */
                                
             
                         
                                
                
                         
                       
                        
 

                                     
            
            
                 
                  
 

/** 呈现只引用现场；关闭或改变形态不会删除现场。 */
                                    
             
                     
                                   
                  
                             
 

                                 
                           
                             
                                     
 

                             
                                                                                                    
                                                     
                                                                                            
                                                                                                             
                                                                                                                                
                                                                                                                                                      

                             
                                       
                                                            

                                  
                                                                           
                                                                                                                         
                 
 

/** 下一次输入的只读数据；provenance 保留历史来源，不扩展供给。 */
                                        
                     
                         
                                
                
                         
                                                                                        
 
