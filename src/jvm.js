import Chart from 'chart.js/auto';
import { t, getLang } from './i18n.js';

// 설정 정보 로드
const PTA_CFG = window.PTA_CONFIG || {};
const DOMAIN_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/domain';
const INSTANCE_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/instance';
const API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/dbmetrics';
const TOKEN = PTA_CFG.TOKEN || '';

// 전역 변수
let jvmChartInstance = null;
let domainTree = [];
let currentSelectedPath = [];
let selectedInstanceId = '';

// DOM 요소
const instanceSelect = document.getElementById('instanceSelect');
const loadingOverlay = document.getElementById('loadingOverlay');

// KPI 요약 카드 DOM
const throughputValue = document.getElementById('throughputValue');
const avgPauseValue = document.getElementById('avgPauseValue');
const gcFreqValue = document.getElementById('gcFreqValue');
const gcImpactValue = document.getElementById('gcImpactValue');
const recommendationList = document.getElementById('recommendationList');

// Chart.js 스타일 설정
Chart.defaults.font.family = '"Pretendard JP Variable", "Pretendard JP", sans-serif';
Chart.defaults.color = "#64748b";

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  if (!TOKEN || !PTA_CFG.BASE_URL) {
    alert('설정 정보(Token)가 부족합니다.');
    return;
  }

  // 1. 도메인 트리 로드
  await loadDomainTree();

  // 2. 필터 연동
  instanceSelect.addEventListener('change', (e) => {
    selectedInstanceId = e.target.value;
    loadData();
  });
});

function formatDateParam(date, isEnd = false) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = isEnd ? '24' : '00';
  return `${y}${m}${d}${h}`;
}

async function fetchMetricData(domainId, targetId, targetType, startTime, endTime, intervalMinute, metrics) {
  if (!domainId) return [];

  let endpoint;
  if (!targetId) {
    endpoint = `${API_BASE}/domain`;
  } else {
    endpoint = targetType === 'instance' ? `${API_BASE}/instance` : `${API_BASE}/business`;
  }

  const url = new URL(endpoint, window.location.origin);
  url.searchParams.append('token', TOKEN);
  url.searchParams.append('domain_id', domainId);

  if (targetId) {
    if (targetType === 'instance') {
      url.searchParams.append('instance_id', targetId);
    } else {
      url.searchParams.append('business_id', targetId);
    }
  }
  url.searchParams.append('time_pattern', 'yyyyMMddHH');
  url.searchParams.append('start_time', startTime);
  url.searchParams.append('end_time', endTime);
  url.searchParams.append('interval_minute', intervalMinute);
  url.searchParams.append('metrics', metrics);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
  const data = await response.json();
  return data.result || [];
}

// 도메인 트리 구축
function buildDomainTree(flatDomains) {
  const tree = [];
  flatDomains.forEach(domain => {
    let currentLevel = tree;
    const hierarchy = domain.groupHierarchy || [t('domain.uncategorized')];

    hierarchy.forEach((groupName) => {
      let group = currentLevel.find(item => item.name === groupName && item.type === 'group');
      if (!group) {
        group = { name: groupName, type: 'group', children: [] };
        currentLevel.push(group);
      }
      currentLevel = group.children;
    });

    currentLevel.push({
      id: domain.domainId,
      name: domain.name,
      type: 'domain'
    });
  });
  return tree;
}

// 도메인 트리 조회 및 초기 선택
async function loadDomainTree() {
  const url = `${DOMAIN_API_BASE}?token=${TOKEN}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Domain API load failed');
    const data = await response.json();
    const flatDomains = data.result || [];
    domainTree = buildDomainTree(flatDomains);

    const firstDomain = findFirstDomain(domainTree);
    if (firstDomain) {
      updateSelectedPath(firstDomain.path);
    }
  } catch (error) {
    console.warn('도메인 API 호출 실패. Mock 트리를 설정합니다.');
    domainTree = [
      {
        id: 'group_1', name: 'Jennifer Production Group', type: 'group',
        children: [
          { id: '1001', name: 'Commerce Main WAS', type: 'domain' },
          { id: '1002', name: 'Order Processing WAS', type: 'domain' }
        ]
      }
    ];
    const firstDomain = findFirstDomain(domainTree);
    if (firstDomain) {
      updateSelectedPath(firstDomain.path);
    }
  }
}

function findFirstDomain(nodes, path = []) {
  for (let node of nodes) {
    const currentPath = [...path, { id: node.id, name: node.name, type: node.type }];
    if (node.type === 'domain') {
      return { domainId: node.id, path: currentPath };
    }
    if (node.type === 'group' && node.children) {
      const found = findFirstDomain(node.children, currentPath);
      if (found) return found;
    }
  }
  return null;
}

function updateSelectedPath(path) {
  currentSelectedPath = path;
  renderHierarchicalSelector();
  const lastItem = path[path.length - 1];
  if (lastItem && lastItem.type === 'domain') {
    loadInstances(lastItem.id);
  }
}

async function loadInstances(domainId) {
  const url = `${INSTANCE_API_BASE}?token=${TOKEN}&domain_id=${domainId}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Instance API load failed');
    const data = await response.json();
    const instances = data.result || [];
    instances.sort((a, b) => a.instanceId - b.instanceId);

    instanceSelect.innerHTML = '';
    instances.forEach(ins => {
      const opt = document.createElement('option');
      opt.value = ins.instanceId;
      opt.textContent = ins.name;
      instanceSelect.appendChild(opt);
    });
  } catch (error) {
    // Mock Instances
    const mockInstances = [
      { instanceId: '1', name: `Instance-${domainId}-1 (AP Server)` },
      { instanceId: '2', name: `Instance-${domainId}-2 (Batch Server)` }
    ];
    instanceSelect.innerHTML = '';
    mockInstances.forEach(ins => {
      const opt = document.createElement('option');
      opt.value = ins.instanceId;
      opt.textContent = ins.name;
      instanceSelect.appendChild(opt);
    });
  }

  selectedInstanceId = instanceSelect.value;
  loadData();
}

function renderHierarchicalSelector() {
  const container = document.getElementById('breadcrumbContainer');
  if (!container) return;
  container.innerHTML = '';

  currentSelectedPath.forEach((item, index) => {
    if (index > 0) {
      const sep = document.createElement('div');
      sep.className = 'breadcrumb-separator';
      sep.textContent = '>';
      container.appendChild(sep);
    }

    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'breadcrumb-item';

    const icon = document.createElement('span');
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>`;

    const text = document.createElement('span');
    text.textContent = item.name;

    breadcrumb.appendChild(icon);
    breadcrumb.appendChild(text);

    if (item.type === 'group' || index === currentSelectedPath.length - 1) {
      const arrow = document.createElement('span');
      arrow.style.marginLeft = '4px';
      arrow.style.fontSize = '0.7rem';
      arrow.textContent = '▼';
      breadcrumb.appendChild(arrow);
    }

    breadcrumb.addEventListener('click', (e) => {
      e.stopPropagation();
      
      const oldPopover = document.getElementById('hierarchicalSelectorPopup');
      if (oldPopover) {
        const wasOpenForThis = oldPopover.dataset.breadcrumbIndex === String(index);
        oldPopover.remove();
        if (wasOpenForThis) return;
      }

      let levelItems = domainTree;
      const basePath = currentSelectedPath.slice(0, index);
      for (let i = 0; i < index; i++) {
        const found = levelItems.find(n => n.name === currentSelectedPath[i].name);
        if (found) levelItems = found.children;
      }

      const popover = createPopover(levelItems, (selectedPath) => {
        const finalPath = [...basePath, ...selectedPath];
        const lastSelected = finalPath[finalPath.length - 1];

        if (lastSelected.type === 'domain') {
          updateSelectedPath(finalPath);
        } else {
          let targetNode = domainTree;
          for (let i = 0; i < finalPath.length; i++) {
            const found = targetNode.find(n => n.name === finalPath[i].name);
            if (found) targetNode = (found.type === 'group') ? found.children : [found];
          }
          const firstInGroup = findFirstDomain(targetNode, finalPath);
          if (firstInGroup) {
            updateSelectedPath(firstInGroup.path);
          }
        }
      }, 0);

      popover.id = 'hierarchicalSelectorPopup';
      popover.dataset.breadcrumbIndex = String(index);
      popover.style.position = 'absolute';
      
      const rect = breadcrumb.getBoundingClientRect();
      popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
      popover.style.left = `${rect.left + window.scrollX}px`;

      document.body.appendChild(popover);
      setTimeout(() => popover.classList.add('active'), 0);
    });

    container.appendChild(breadcrumb);
  });
}

function createPopover(items, onSelect, level = 0, currentLevelPath = []) {
  const popover = document.createElement('div');
  popover.className = 'selector-popover';
  if (level > 0) popover.classList.add('submenu');

  items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'popover-item';
    if (item.children && item.children.length > 0) el.classList.add('has-children');

    const itemPath = [...currentLevelPath, { id: item.id, name: item.name, type: item.type }];

    el.innerHTML = `
      <div class="popover-item-content">
        <span class="popover-item-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        </span>
        <span>${item.name}</span>
      </div>
    `;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(itemPath);
      const rootPopover = document.getElementById('hierarchicalSelectorPopup');
      if (rootPopover) rootPopover.remove();
    });

    if (item.type === 'group' && item.children && item.children.length > 0) {
      let submenu = null;
      const showSubmenu = () => {
        if (!submenu) {
          submenu = createPopover(item.children, onSelect, level + 1, itemPath);
          el.appendChild(submenu);
        }
        submenu.classList.add('active');
        submenu.style.position = 'absolute';
        submenu.style.left = '100.2%';
        submenu.style.top = '-6px';
      };
      const hideSubmenu = () => { if (submenu) submenu.classList.remove('active'); };
      el.addEventListener('mouseenter', showSubmenu);
      el.addEventListener('mouseleave', hideSubmenu);
    }
    popover.appendChild(el);
  });

  if (level === 0) {
    const closeHandler = (e) => {
      if (!popover.contains(e.target) && !e.target.closest('.breadcrumb-item')) {
        popover.classList.remove('active');
        setTimeout(() => {
          if (popover.parentNode) popover.remove();
        }, 200);
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }
  return popover;
}

// 수리 통계 및 분석 모델 실행
async function loadData() {
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');

  const domainId = currentSelectedPath[currentSelectedPath.length - 1]?.id;
  const instanceId = selectedInstanceId;

  let realDataFetched = false;
  let timeLabels = [];
  let alignedHeap = [];
  let alignedCpu = [];
  let alignedServiceTime = [];
  let alignedServiceCount = [];
  let alignedGcEvents = [];
  let alignedGcPauses = [];
  let alignedThroughputs = [];

  let overallThroughput = 100;
  let overallAvgPause = 0;
  let overallGcFreq = 0;
  let correlation = 0;
  let statusClass = 'healthy';

  if (domainId && instanceId) {
    const today = new Date();
    const prior = new Date();
    prior.setDate(today.getDate() - 1); // 24 Hours

    const startTimeStr = formatDateParam(prior, false);
    const endTimeStr = formatDateParam(today, true);

    try {
      const [heapData, cpuData, timeData, countData] = await Promise.all([
        fetchMetricData(domainId, instanceId, 'instance', startTimeStr, endTimeStr, 60, 'heap_usage'),
        fetchMetricData(domainId, instanceId, 'instance', startTimeStr, endTimeStr, 60, 'sys_cpu'),
        fetchMetricData(domainId, instanceId, 'instance', startTimeStr, endTimeStr, 60, 'service_time'),
        fetchMetricData(domainId, instanceId, 'instance', startTimeStr, endTimeStr, 60, 'service_count')
      ]);

      if (heapData && heapData.length > 5 && cpuData && cpuData.length > 5 && timeData && timeData.length > 5) {
        const timeMap = {};
        
        heapData.forEach(item => {
          if (!timeMap[item.time]) timeMap[item.time] = {};
          timeMap[item.time].heap = item.value;
        });
        cpuData.forEach(item => {
          if (!timeMap[item.time]) timeMap[item.time] = {};
          timeMap[item.time].cpu = item.value;
        });
        timeData.forEach(item => {
          if (!timeMap[item.time]) timeMap[item.time] = {};
          timeMap[item.time].serviceTime = item.value;
        });
        if (countData) {
          countData.forEach(item => {
            if (!timeMap[item.time]) timeMap[item.time] = {};
            timeMap[item.time].serviceCount = item.value;
          });
        }

        const sortedTimes = Object.keys(timeMap).sort();
        const validTimes = sortedTimes.filter(t => 
          timeMap[t].heap !== undefined && 
          timeMap[t].cpu !== undefined && 
          timeMap[t].serviceTime !== undefined
        );

        if (validTimes.length > 5) {
          validTimes.forEach((t, i) => {
            const hVal = timeMap[t].heap;
            const cVal = timeMap[t].cpu;
            const sVal = timeMap[t].serviceTime;
            const cntVal = timeMap[t].serviceCount || 0;

            // 1. GC Event: Heap drop >= 3% compared to previous hour
            let gcEvent = 0;
            if (i > 0) {
              const prevHVal = timeMap[validTimes[i - 1]].heap;
              if (hVal < prevHVal - 3) {
                gcEvent = 1;
              }
            }

            // 2. Estimated Pause (ms)
            const pause = hVal * (1 + cVal / 100) * 1.5;

            // 3. JVM Throughput (%)
            const gcTime = gcEvent === 1 ? (pause / 1000) : 0;
            const throughput = (1 - (gcTime / 3600)) * 100;

            // Format Hour Label (HH:00)
            const hh = t.substring(8, 10) + ':00';

            timeLabels.push(hh);
            alignedHeap.push(hVal);
            alignedCpu.push(cVal);
            alignedServiceTime.push(sVal);
            alignedServiceCount.push(cntVal);
            alignedGcEvents.push(gcEvent);
            alignedGcPauses.push(pause);
            alignedThroughputs.push(throughput);
          });

          // Aggregate overall stats
          const totalGcEvents = alignedGcEvents.reduce((a, b) => a + b, 0);
          overallGcFreq = totalGcEvents;
          overallAvgPause = alignedGcPauses.reduce((a, b) => a + b, 0) / alignedGcPauses.length;
          overallThroughput = alignedThroughputs.reduce((a, b) => a + b, 0) / alignedThroughputs.length;

          // Pearson Correlation
          correlation = calculateCorrelation(alignedHeap, alignedServiceTime);

          // Status class definition
          if (overallAvgPause > 180 || overallThroughput < 99.98) {
            statusClass = 'danger';
          } else if (overallAvgPause > 120 || overallThroughput < 99.995) {
            statusClass = 'warning';
          } else {
            statusClass = 'healthy';
          }

          realDataFetched = true;
        }
      }
    } catch (err) {
      console.warn('[JVM GC Analyzer] Failed to fetch metrics from API.', err);
    }
  }

  // 데이터 부족/부재 시 UI 공백 상태 가드
  if (!realDataFetched) {
    throughputValue.textContent = '-';
    avgPauseValue.textContent = '-';
    gcFreqValue.textContent = '-';
    gcImpactValue.innerHTML = `<span class="status-badge stable">${t('heatmap.noDataShort')}</span>`;
    
    // 권장사항 안내 분리
    let recNoDataMsg = getLang() === 'ko' ? '분석에 필요한 JVM CPU 및 힙 메트릭 데이터가 부족하여 권장 사항을 생성할 수 없습니다.' : getLang() === 'ja' ? '分析に必要なJVM CPUおよびヒープメトリクスデータが不足しているため、推奨事項を生成できません。' : 'Insufficient JVM CPU and heap telemetry to generate tuning recommendations.';
    recommendationList.innerHTML = `<div style="text-align: center; padding: 1.5rem; color: var(--text-secondary); font-size: 0.9rem;">${recNoDataMsg}</div>`;

    if (jvmChartInstance) {
      jvmChartInstance.destroy();
      jvmChartInstance = null;
    }

    const canvas = document.getElementById('jvmGcChart');
    if (canvas) {
      canvas.style.display = 'none';
      const container = canvas.parentNode;
      container.style.position = 'relative';
      
      let overlay = container.querySelector('.chart-no-data-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'chart-no-data-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.color = '#64748b';
        overlay.style.fontSize = '0.95rem';
        overlay.style.fontWeight = '500';
        overlay.style.pointerEvents = 'none';
        container.appendChild(overlay);
      }
      overlay.textContent = t('heatmap.noData');
      overlay.style.display = 'flex';
    }

    if (loadingOverlay) loadingOverlay.classList.add('hidden');
    return;
  }

  // Update UI values
  throughputValue.textContent = `${overallThroughput.toFixed(4)} %`;
  avgPauseValue.textContent = `${overallAvgPause.toFixed(1)} ms`;
  gcFreqValue.textContent = getLang() === 'ko' ? `${overallGcFreq} 회 / 일` : getLang() === 'ja' ? `${overallGcFreq} 回 / 日` : `${overallGcFreq} cycles/day`;

  let badgeText = t('jvm.statusHealthy');
  if (statusClass === 'warning') badgeText = t('jvm.statusWarning');
  if (statusClass === 'danger') badgeText = t('jvm.statusDanger');
  gcImpactValue.innerHTML = `<span class="status-badge ${statusClass}">${badgeText}</span>`;

  // Render chart
  renderChart(timeLabels, alignedServiceTime, alignedHeap, alignedGcPauses);

  // Generate Recommendations
  updateRecommendations(overallAvgPause, overallThroughput, overallGcFreq, alignedHeap, alignedCpu, correlation);

  if (loadingOverlay) loadingOverlay.classList.add('hidden');
}

function calculateCorrelation(x, y) {
  const n = x.length;
  if (n === 0) return 0;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  
  let num = 0;
  let denX = 0;
  let denY = 0;
  
  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    num += diffX * diffY;
    denX += diffX * diffX;
    denY += diffY * diffY;
  }
  
  if (denX === 0 || denY === 0) return 0;
  return num / Math.sqrt(denX * denY);
}

function updateRecommendations(avgPause, avgThroughput, totalGcEvents, heapUsages, cpuUsages, correlation) {
  recommendationList.innerHTML = '';
  const currentLang = getLang();
  const recommendations = [];

  const maxHeap = Math.max(...heapUsages);
  const maxCpu = Math.max(...cpuUsages);

  // Rule 1: High GC Pause Time
  if (avgPause > 130) {
    if (currentLang === 'ko') {
      recommendations.push(`<li><strong>JVM 최대 힙 크기 설정 확장 (-Xmx)</strong>: 평균 GC 지연 시간(STW)이 <strong>${avgPause.toFixed(1)}ms</strong>로 다소 지연됩니다. 객체 소거 성능 향상을 위해 힙 공간을 최소 30% 이상 증설할 것을 권장합니다.</li>`);
    } else if (currentLang === 'ja') {
      recommendations.push(`<li><strong>JVM最大ヒープサイズ設定拡張 (-Xmx)</strong>: 平均GC一時停止時間(STW)が <strong>${avgPause.toFixed(1)}ms</strong>とやや遅延しています。オブジェクトの回収性能向上のため、ヒープ領域を少なくとも30%以上増設することを推奨します。</li>`);
    } else {
      recommendations.push(`<li><strong>Expand Max JVM Heap Size (-Xmx)</strong>: The average GC pause time (STW) is <strong>${avgPause.toFixed(1)}ms</strong>. To improve reclamation efficiency, we recommend increasing the JVM heap space by at least 30%.</li>`);
    }
  }

  // Rule 2: Correlation between Heap and Service Time
  if (correlation > 0.35) {
    if (currentLang === 'ko') {
      recommendations.push(`<li><strong>힙 사용량-응답속도 높은 양의 상관성 확인 (${correlation.toFixed(2)})</strong>: 힙 사용률 상승이 서비스 처리 지연과 뚜렷한 관련성을 보입니다. 이는 GC 스레드 병목 현상이 의심되므로 GC 실행 로그 및 메모리 할당(Allocation) 빈도를 조사하십시오.</li>`);
    } else if (currentLang === 'ja') {
      recommendations.push(`<li><strong>ヒープ使用量-応答時間の高い相関 (${correlation.toFixed(2)})</strong>: ヒープ使用率の上昇と応答遅延の間に明確な相関が検出されました。GCスレッドのオーバーヘッドが疑われるため、GCログおよびメモリ割り当て頻度を調査してください.</li>`);
    } else {
      recommendations.push(`<li><strong>High Heap-Response Latency Correlation (${correlation.toFixed(2)})</strong>: Memory footprint hikes strongly align with response time degradation. This implies active GC bottlenecks. Audit thread allocation frequency and GC logs.</li>`);
    }
  }

  // Rule 3: High GC Frequency
  if (totalGcEvents > 6) {
    if (currentLang === 'ko') {
      recommendations.push(`<li><strong>세대별 메모리 공간 구성비(New/Old Ratio) 최적화</strong>: 일평균 <strong>${totalGcEvents}회</strong>의 주요 GC 힙 소거 이벤트가 식별되었습니다. Eden/Survivor 영역 크기를 조율해 단명 객체가 Old 영역으로 즉시 이관(Promotion)되어 Major GC를 촉발시키는 확률을 억제하십시오.</li>`);
    } else if (currentLang === 'ja') {
      recommendations.push(`<li><strong>世代別領域比率 (New/Old Ratio) の最適化</strong>: 日あたり <strong>${totalGcEvents}回</strong>의 주요한GC이벤트가 검지되었습니다. Eden/Survivor 사이즈를 튜닝하여 단명 객체가 Old 영역으로 조기 승격(Promotion)되어 Major GC를 유발하는 것을 억제해 주십시오.</li>`);
    } else {
      recommendations.push(`<li><strong>Optimize Generation Allocation Sizes (New/Old Ratio)</strong>: Identified <strong>${totalGcEvents} major GC events</strong>. Fine-tune Eden/Survivor boundaries to prevent short-lived objects from premature promotion into the Old generation.</li>`);
    }
  }

  // Rule 4: High CPU Peak with GC
  if (maxCpu > 75) {
    if (currentLang === 'ko') {
      recommendations.push(`<li><strong>저지연 GC 알고리즘(ZGC) 도입 검토</strong>: 피크 CPU 부하가 <strong>${maxCpu.toFixed(1)}%</strong>에 도달하였습니다. GC 오버헤드로 인한 서비스 스레드 자원 경합을 해소하기 위해 저지연 특화 컬렉터(ZGC) 도입이나 <code>-XX:MaxGCPauseMillis</code> 매개변수 하향 조정을 제안합니다.</li>`);
    } else if (currentLang === 'ja') {
      recommendations.push(`<li><strong>低遅延コレクター(ZGC)の導入検討</strong>: ピークCPU負荷が <strong>${maxCpu.toFixed(1)}%</strong>に達しています。GC時のCPU競合を回避するため、低遅延コレクター(ZGC)の導入や <code>-XX:MaxGCPauseMillis</code> オプションの調整を検討してください。</li>`);
    } else {
      recommendations.push(`<li><strong>Evaluate Low-Latency Collectors (e.g. ZGC)</strong>: Peak CPU load hit <strong>${maxCpu.toFixed(1)}%</strong>. To mitigate CPU thread contention during GC execution, consider switching to ZGC or tuning <code>-XX:MaxGCPauseMillis</code>.</li>`);
    }
  }

  // Default healthy check
  if (recommendations.length === 0) {
    if (currentLang === 'ko') {
      recommendations.push(`<li><strong>JVM 성능 및 GC 영향도 매우 안정적</strong>: 처리 가용량, 지연 시간, 자원 부하가 통계적 임계범위 내에서 안정적으로 제어되고 있습니다. 추가적인 조치가 필요하지 않습니다.</li>`);
    } else if (currentLang === 'ja') {
      recommendations.push(`<li><strong>JVM稼働状態は極めて健全</strong>: 処理効率、一時停止時間、および相関係数はすべて良好なコントロール限界値内です。特段のチューニングアクションは不要です。</li>`);
    } else {
      recommendations.push(`<li><strong>JVM GC Performance Highly Stable</strong>: Throughput, pause times, and resource correlation indexes are all within normal control limits. No immediate tuning action required.</li>`);
    }
  }

  recommendations.forEach(rec => {
    const li = document.createElement('li');
    li.innerHTML = rec;
    recommendationList.appendChild(li);
  });
}

function renderChart(labels, serviceTimes, heapUsages, estimatedPauses) {
  const canvas = document.getElementById('jvmGcChart');
  if (canvas) {
    canvas.style.display = 'block';
    const container = canvas.parentNode;
    const overlay = container.querySelector('.chart-no-data-overlay');
    if (overlay) overlay.style.display = 'none';
  }
  const ctx = canvas.getContext('2d');

  if (jvmChartInstance) {
    jvmChartInstance.destroy();
  }

  jvmChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          type: 'bar',
          label: t('jvm.avgPause') + ' (Estimated, ms)',
          data: estimatedPauses,
          backgroundColor: 'rgba(245, 158, 11, 0.65)',
          borderColor: '#d97706',
          borderWidth: 1,
          yAxisID: 'yLeft',
          order: 3
        },
        {
          type: 'line',
          label: t('summary.avgResponseTime') + ' (ms)',
          data: serviceTimes,
          borderColor: '#3b82f6',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.2,
          yAxisID: 'yLeft',
          order: 1
        },
        {
          type: 'line',
          label: t('metric.heap_usage') + ' (%)',
          data: heapUsages,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.05)',
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.2,
          yAxisID: 'yRight',
          fill: true,
          order: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.dataset.label || '';
              const value = context.raw;
              if (context.datasetIndex === 2) {
                return ` ${label}: ${value.toFixed(1)} %`;
              }
              return ` ${label}: ${value.toFixed(1)} ms`;
            }
          }
        }
      },
      scales: {
        yLeft: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Response Time / GC Pause (ms)', font: { weight: 'bold' } },
          grid: { color: '#e2e8f0' },
          min: 0
        },
        yRight: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'JVM Heap Usage (%)', font: { weight: 'bold' } },
          grid: { drawOnChartArea: false },
          min: 0,
          max: 100
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}
