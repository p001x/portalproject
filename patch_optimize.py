import re

with open('backend/gee/earthwork.py', 'r', encoding='utf-8') as f:
    content = f.read()

target_logic = """                  adj_cut = raw_cut * swell_factor
                  adj_fill = (raw_fill / shrink_factor) if shrink_factor > 0 else raw_fill
                  
                  net_balance = adj_cut - adj_fill
                  
                  # Cost function: Total earth moved + strong penalty for unbalanced site
                  cost = adj_cut + adj_fill + 5 * abs(net_balance)"""

new_logic = """                  adj_cut = raw_cut * swell_factor
                  adj_fill = (raw_fill / shrink_factor) if shrink_factor > 0 else raw_fill
                  
                  net_balance = adj_cut - adj_fill
                  
                  cut_mask = diff > 0
                  fill_mask = diff < 0
                  if np.sum(cut_mask) > 0 and np.sum(fill_mask) > 0:
                      cut_cx = np.sum(X[cut_mask] * cut) / raw_cut
                      cut_cy = np.sum(Y[cut_mask] * cut) / raw_cut
                      fill_cx = np.sum(X[fill_mask] * fill) / raw_fill
                      fill_cy = np.sum(Y[fill_mask] * fill) / raw_fill
                      haul_dist = math.sqrt(((cut_cx - fill_cx)*111320*math.cos(cy_rad))**2 + ((cut_cy - fill_cy)*111320)**2)
                      # Haul effort penalty (m3 * km) 
                      haul_penalty = (adj_cut * haul_dist) / 1000.0
                  else:
                      haul_penalty = 0.0

                  # Cost function: Total earth moved + strong penalty for unbalanced site + haul effort penalty
                  cost = adj_cut + adj_fill + 5 * abs(net_balance) + (0.5 * haul_penalty)"""

content = content.replace(target_logic, new_logic)

with open('backend/gee/earthwork.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Optimization function patched!")
