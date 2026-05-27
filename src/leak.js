import Chart from 'chart.js/auto';
import { t, getLang } from './i18n.js';

// 설정 정보 로드
const PTA_CFG = window.PTA_CONFIG || {};
const DOMAIN_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/domain';
const INSTANCE_API_BASE = (PTA_CFG.API_DOMAIN || '') + '/api/instance';
const TOKEN = PTA_CFG.TOKEN || '';

// 전역 변수
let heapChartInstance = null;
let domainTree = [];
let currentSelectedPath = [];
let periodDays = 90; // Default 90 days
let selectedInstanceId = '';

// DOM 요소
const instanceSelect = document.getElementById('instanceSelect');
const periodSelect = document.getElementById('periodSelect');
const loadingOverlay = document.getElementById('loadingOverlay');

// KPI 요약 카드 DOM
const uptimeValue = document.getElementById('uptimeValue');
const slopeValue = document.getElementById('slopeValue');
const daysToOomValue = document.getElementById('daysToOomValue');
const restartStatusValue = document.getElementById('restartStatusValue');
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

  periodSelect.addEventListener('change', (e) => {
    periodDays = parseInt(e.target.value);
    loadData();
  });
});

// 도메인 트리 조회 및 초기 선택
async function loadDomainTree() {
  const url = `${DOMAIN_API_BASE}?token=${TOKEN}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Domain API load failed');
    const data = await response.json();
    domainTree = data.result || [];

    // 최초 도메인 강제 선택
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

// 팝오버 생성 및 경로 렌더링
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

// 데이터 시뮬레이터 및 분석 실행
function loadData() {
  if (loadingOverlay) loadingOverlay.classList.remove('hidden');

  setTimeout(() => {
    // 1. 기간에 따른 일수 생성
    const totalPoints = periodDays;
    const dates = [];
    const now = new Date();
    for (let i = totalPoints - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      dates.push(d.toLocaleDateString(getLang() === 'ko' ? 'ko-KR' : 'ja-JP', { month: 'short', day: 'numeric' }));
    }

    // 2. 인스턴스에 따라 힙 유출 속도(Slope) 설정
    // 인스턴스 1: 완만한 누수, 인스턴스 2: 급격한 누수, 기타: 지극히 안전한 상태
    let leakRate = 0.8; // 기본 MB/day
    let initBaseline = 980; // 초기 GC 직후 힙 메모리 (MB)
    let uptimeDays = 12; // 가동일수
    
    if (selectedInstanceId && selectedInstanceId.endsWith('1')) {
      leakRate = 4.8;
      initBaseline = 1120;
      uptimeDays = 82;
    } else if (selectedInstanceId && selectedInstanceId.endsWith('2')) {
      leakRate = 22.5;
      initBaseline = 850;
      uptimeDays = 142;
    }

    const maxHeap = 4096; // WAS 최대 Heap (4GB)
    const rawHeapFootprints = [];
    const trendHeapLine = [];

    // 3. 톱니바퀴 GC 후 잔류량 시뮬레이션 데이터 생성 (선형 누수 + 일부 잡음)
    for (let i = 0; i < totalPoints; i++) {
      const progressDays = uptimeDays - (totalPoints - 1) + i;
      let postGcMin = initBaseline + (progressDays * leakRate);
      
      // 잡음 추가 (+/- 15MB)
      postGcMin += (Math.sin(i / 3) * 15) + (Math.cos(i / 1.5) * 5);
      
      // Heap Max 임계치를 못 넘게 바인딩 (실제 OOM나기 전까지 버티는 모습)
      postGcMin = Math.min(maxHeap - 50, postGcMin);
      rawHeapFootprints.push(Math.round(postGcMin));
    }

    // 4. 선형 회귀 분석 실행 (Linear Regression $y = ax + b$)
    const xValues = Array.from({ length: totalPoints }, (_, i) => i);
    const yValues = rawHeapFootprints;
    
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < totalPoints; i++) {
      sumX += xValues[i];
      sumY += yValues[i];
      sumXY += xValues[i] * yValues[i];
      sumXX += xValues[i] * xValues[i];
    }
    const n = totalPoints;
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // 회귀 추세선 포인트 대입
    for (let i = 0; i < totalPoints; i++) {
      trendHeapLine.push(Math.round(slope * i + intercept));
    }

    // 5. OOM 수명 예측 계산
    const currentBaseline = rawHeapFootprints[rawHeapFootprints.length - 1];
    const remainingMemory = maxHeap - currentBaseline;
    let daysToOom = Math.round(remainingMemory / slope);
    
    // 기울기가 거의 0이거나 음수인 경우
    if (slope <= 0.05) {
      daysToOom = Infinity;
    }

    // 6. 상태 배지 결정
    let statusText = t('leak.statusHealthy');
    let statusClass = 'healthy';
    if (daysToOom < 30) {
      statusText = t('leak.statusDanger');
      statusClass = 'danger';
    } else if (daysToOom < 100) {
      statusText = t('leak.statusWarning');
      statusClass = 'warning';
    }

    // 7. UI 업데이트
    uptimeValue.textContent = `${uptimeDays} Days`;
    slopeValue.textContent = `${slope.toFixed(2)} MB/Day`;
    daysToOomValue.textContent = isFinite(daysToOom) ? `${daysToOom} Days` : '∞ (Stable)';
    
    restartStatusValue.innerHTML = `<span class="status-badge ${statusClass}">${statusText}</span>`;

    // 추천 액션 리포트 업데이트
    updateRecommendations(statusClass, daysToOom, slope, maxHeap, currentBaseline);

    // 8. 차트 렌더링
    renderChart(dates, rawHeapFootprints, trendHeapLine, maxHeap);

    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }, 500);
}

function updateRecommendations(statusClass, daysToOom, slope, maxHeap, currentBaseline) {
  recommendationList.innerHTML = '';
  
  const recommendations = [];
  const currentLang = getLang();

  if (statusClass === 'danger') {
    if (currentLang === 'ko') {
      recommendations.push(`<strong>CRITICAL</strong>: 힙 사용량이 Max Limit(${maxHeap}MB)의 ${((currentBaseline/maxHeap)*100).toFixed(0)}%에 도달했습니다. 예상 OOM 시점이 ${daysToOom}일 이내로 다가왔습니다.`);
      recommendations.push(`<strong>즉시 조치</strong>: 이번 주말 야간 점검 시 해당 인스턴스의 Graceful Restart(정기 재기동)를 수행하십시오.`);
      recommendations.push(`<strong>상세 진단 필요</strong>: GC 로그 파일 분석을 수행하여 Memory Leak(예: 누적된 Map 객체, 제거되지 않은 스레드 로컬) 코드가 배포되었는지 확인하십시오.`);
    } else if (currentLang === 'ja') {
      recommendations.push(`<strong>CRITICAL</strong>: ヒープ使用量が最大制限値(${maxHeap}MB)の ${((currentBaseline/maxHeap)*100).toFixed(0)}%に達しています。予測OOMまで残り ${daysToOom}日です。`);
      recommendations.push(`<strong>即時推奨</strong>: 今週末の夜間メンテナンス時に当該インスタンスのGraceful Restartを実行してください。`);
      recommendations.push(`<strong>詳細分析</strong>: メモリリーク（解放されていないMap、ThreadLocal等）コードの混入がないか、ヒープダンプおよびGCログを確認してください。`);
    } else {
      recommendations.push(`<strong>CRITICAL</strong>: Heap footprint reached ${((currentBaseline/maxHeap)*100).toFixed(0)}% of Max Limit(${maxHeap}MB). Forecasted OOM within ${daysToOom} days.`);
      recommendations.push(`<strong>Immediate Action</strong>: Schedule a Graceful Restart of this instance during the upcoming weekend maintenance window.`);
      recommendations.push(`<strong>Root Cause Audit</strong>: Trigger heap dumps and analyze GC log files for memory leaks (e.g., unremoved ThreadLocals, static caches).`);
    }
  } else if (statusClass === 'warning') {
    if (currentLang === 'ko') {
      recommendations.push(`<strong>WARNING</strong>: 미세한 메모리 누수(${slope.toFixed(2)} MB/Day)가 관측됩니다. OOM 예상 한계점까지 약 ${daysToOom}일의 여유가 있습니다.`);
      recommendations.push(`<strong>예방 수칙</strong>: 30일 이내에 시스템 정기 배포가 없다면, 정기 재기동 정책(예: 60일 주기 자동 재기동)을 스케줄링하십시오.`);
      recommendations.push(`<strong>모니터링 강화</strong>: 임계 영역 힙 증가 추세를 매주 확인하십시오.`);
    } else if (currentLang === 'ja') {
      recommendations.push(`<strong>WARNING</strong>: 微小なメモリリーク(${slope.toFixed(2)} MB/Day)が観測されています。OOM予測限界点まであと約 ${daysToOom}日です。`);
      recommendations.push(`<strong>予防保守</strong>: 今後30日以内にシステムデプロイ予定がない場合は、定期再起動スケジュール（例：60日周期自動再起動）を設定してください。`);
      recommendations.push(`<strong>監視強化</strong>: ヒープの毎週の増加傾向をトラッキングしてください。`);
    } else {
      recommendations.push(`<strong>WARNING</strong>: Micro memory leak detected (${slope.toFixed(2)} MB/Day). Residual time before OOM is approximately ${daysToOom} days.`);
      recommendations.push(`<strong>Prevention Rule</strong>: If no release deployment is scheduled within 30 days, set up a rolling restart schedule (e.g., 60-day auto-restart).`);
      recommendations.push(`<strong>Enhanced Monitor</strong>: Watch weekly heap trends in the monitoring dashboard.`);
    }
  } else {
    if (currentLang === 'ko') {
      recommendations.push(`<strong>HEALTHY</strong>: 메모리 누수 경향이 관측되지 않거나 지극히 정상 범위(${slope.toFixed(2)} MB/Day) 내에 있습니다.`);
      recommendations.push(`현재 시스템은 매우 안정적이며, 100일 이상 무정지 기동 시에도 OOM 위험성이 없습니다. 추가적인 예방적 재기동 조치는 불필요합니다.`);
    } else if (currentLang === 'ja') {
      recommendations.push(`<strong>HEALTHY</strong>: メモリリーク傾向は検出されないか、正常な範囲内(${slope.toFixed(2)} MB/Day)です。`);
      recommendations.push(`システムは非常に安定しており、100日以上の連続運転においてもOOMの危険性はありません。追加の予防再起動は不要です。`);
    } else {
      recommendations.push(`<strong>HEALTHY</strong>: No memory leak trend detected. Slope is within normal bounds (${slope.toFixed(2)} MB/Day).`);
      recommendations.push(`The system is highly stabilized. Uptime of 100+ days presents no memory contention. Proactive restart is not required.`);
    }
  }

  recommendations.forEach(text => {
    const li = document.createElement('li');
    li.innerHTML = text;
    recommendationList.appendChild(li);
  });
}

function renderChart(dates, rawData, trendData, maxHeap) {
  const ctx = document.getElementById('heapLeakChart').getContext('2d');
  
  if (heapChartInstance) {
    heapChartInstance.destroy();
  }

  heapChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: t('metric.heap_usage') + ' (Post-GC Min)',
          data: rawData,
          borderColor: '#1e3a8a',
          backgroundColor: 'rgba(30, 58, 138, 0.05)',
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.1,
          fill: true
        },
        {
          label: 'Leak Trend Line (Linear Regression)',
          data: trendData,
          borderColor: '#ef4444',
          borderWidth: 1.5,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false
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
        legend: {
          position: 'top',
          labels: {
            boxWidth: 12,
            font: { size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              return ` ${context.dataset.label}: ${context.raw} MB`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false }
        },
        y: {
          title: {
            display: true,
            text: 'Memory (MB)',
            font: { weight: 'bold' }
          },
          min: 0,
          max: maxHeap + 200,
          grid: {
            color: '#e2e8f0'
          }
        }
      }
    }
  });
}
