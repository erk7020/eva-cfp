// Inicialização do IndexedDB
const DB_NAME = 'EVA_CFP';
const DB_VERSION = 1;
let db;

// Abre a conexão com o banco de dados
const request = indexedDB.open(DB_NAME, DB_VERSION);

request.onerror = (event) => {
    console.error('Erro ao abrir o banco de dados');
};

request.onsuccess = (event) => {
    db = event.target.result;
    inicializarAplicacao();
};

request.onupgradeneeded = (event) => {
    db = event.target.result;
    
    // Criação do objeto store para transações
    const transacoesStore = db.createObjectStore('transacoes', { keyPath: 'id', autoIncrement: true });
    transacoesStore.createIndex('data', 'data', { unique: false });
    transacoesStore.createIndex('tipo', 'tipo', { unique: false });
    transacoesStore.createIndex('categoria', 'categoria', { unique: false });
    
    // Criação do objeto store para categorias
    const categoriasStore = db.createObjectStore('categorias', { keyPath: 'id', autoIncrement: true });
    categoriasStore.createIndex('categoria', 'categoria', { unique: true });
};

// Função para inicializar a aplicação
function inicializarAplicacao() {
    // Carregar categorias existentes
    carregarCategorias();
    
    // Configurar eventos
    configurarEventos();
    
    // Obter mês e ano atual
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1; // +1 porque getMonth() retorna de 0-11
    const anoAtual = hoje.getFullYear();
    
    // Selecionar mês atual nos filtros
    document.getElementById('mes-filtro').value = mesAtual;
    document.getElementById('ano-filtro').value = anoAtual;
    document.getElementById('mes-grafico').value = mesAtual;
    document.getElementById('ano-grafico').value = anoAtual;
    
    // Carregar transações do mês atual
    carregarTransacoes();
    
    // Inicializar gráfico
    inicializarGrafico();
}

// Função para inicializar o gráfico
function inicializarGrafico() {
    const canvas = document.getElementById('grafico');
    const ctx = canvas.getContext('2d');
    
    // Criar gráfico vazio inicialmente
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: []
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Selecione um período para visualizar os gráficos'
                }
            }
        }
    });
}

// Configuração de eventos
function configurarEventos() {
    // Eventos da aba de transações
    document.getElementById('btn-adicionar').addEventListener('click', adicionarTransacao);
    document.getElementById('mes-filtro').addEventListener('change', () => carregarTransacoes());
    document.getElementById('ano-filtro').addEventListener('change', () => carregarTransacoes());
    
    // Eventos da aba de gráficos
    document.getElementById('btn-despesas').addEventListener('click', () => plotarGrafico('despesas'));
    document.getElementById('btn-evolucao').addEventListener('click', () => plotarGrafico('evolucao'));
    document.getElementById('mes-grafico').addEventListener('change', () => atualizarGrafico());
    document.getElementById('ano-grafico').addEventListener('change', () => atualizarGrafico());
    
    // Eventos do modal de categorias
    document.getElementById('btn-gerenciar-categorias').addEventListener('click', abrirModalCategorias);
    document.getElementById('btn-adicionar-categoria').addEventListener('click', adicionarCategoria);
    document.getElementById('btn-remover-categoria').addEventListener('click', removerCategoria);
    document.getElementById('btn-fechar-modal').addEventListener('click', fecharModalCategorias);
    
    // Eventos de navegação entre abas
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            // Remover classe active de todos os botões
            tabBtns.forEach(b => b.classList.remove('active'));
            // Adicionar classe active ao botão clicado
            btn.classList.add('active');
            
            // Remover classe active de todos os conteúdos
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Adicionar classe active ao conteúdo correspondente
            document.getElementById(`${tabId}-tab`).classList.add('active');
            
            // Se for a aba de gráficos, atualizar o gráfico
            if (tabId === 'graficos') {
                const tipoGrafico = localStorage.getItem('ultimoGrafico') || 'despesas';
                plotarGrafico(tipoGrafico);
            }
        });
    });
}

// Funções de transações
function adicionarTransacao() {
    const tipo = document.getElementById('tipo-transacao').value;
    const valor = parseFloat(document.getElementById('valor').value) || 0;
    const descricao = document.getElementById('descricao').value;
    const categoria = document.getElementById('categoria').value;
    const data = new Date().toISOString();
    
    if (!tipo || valor <= 0 || !descricao || !categoria) {
        alert('Por favor, preencha todos os campos corretamente');
        return;
    }
    
    const transacao = {
        tipo,
        valor,
        descricao,
        categoria,
        data
    };
    
    const transaction = db.transaction(['transacoes'], 'readwrite');
    const store = transaction.objectStore('transacoes');
    store.add(transacao);
    
    transaction.oncomplete = () => {
        limparCampos();
        carregarTransacoes();
    };
}

function carregarTransacoes() {
    const mes = parseInt(document.getElementById('mes-filtro').value);
    const ano = parseInt(document.getElementById('ano-filtro').value);
    const dataInicio = new Date(ano, mes - 1, 1).toISOString();
    const dataFim = new Date(ano, mes, 0).toISOString();
    
    const transaction = db.transaction(['transacoes'], 'readonly');
    const store = transaction.objectStore('transacoes');
    const index = store.index('data');
    
    const request = index.getAll(IDBKeyRange.bound(dataInicio, dataFim));
    
    request.onsuccess = (event) => {
        const transacoes = event.target.result;
        atualizarTabela(transacoes);
        calcularSaldo(transacoes);
    };
}

function atualizarTabela(transacoes) {
    const tbody = document.querySelector('#transacoes-tabela tbody');
    tbody.innerHTML = '';
    
    transacoes.forEach(transacao => {
        const linha = document.createElement('tr');
        
        linha.innerHTML = `
            <td>${new Date(transacao.data).toLocaleDateString('pt-BR')}</td>
            <td>${transacao.tipo}</td>
            <td>R$ ${transacao.valor.toFixed(2)}</td>
            <td>${transacao.descricao}</td>
            <td>${transacao.categoria}</td>
            <td>
                <button class="btn-remover" data-id="${transacao.id}">Remover</button>
            </td>
        `;
        
        tbody.appendChild(linha);
    });
    
    // Adicionar evento de remoção para cada botão
    const botoesRemover = tbody.querySelectorAll('.btn-remover');
    botoesRemover.forEach(botao => {
        botao.addEventListener('click', removerTransacao);
    });
}

function removerTransacao(event) {
    const id = parseInt(event.target.dataset.id);
    
    if (!confirm('Tem certeza que deseja remover esta transação?')) {
        return;
    }
    
    const transaction = db.transaction(['transacoes'], 'readwrite');
    const store = transaction.objectStore('transacoes');
    store.delete(id);
    
    transaction.oncomplete = () => {
        carregarTransacoes();
    };
}

function calcularSaldo(transacoes) {
    let saldo = 0;
    transacoes.forEach(transacao => {
        if (transacao.tipo === 'Receita') {
            saldo += transacao.valor;
        } else {
            saldo -= transacao.valor;
        }
    });
    document.getElementById('saldo-text').textContent = `Saldo: R$ ${saldo.toFixed(2)}`;
}

function limparCampos() {
    document.getElementById('valor').value = '';
    document.getElementById('descricao').value = '';
}

// Funções de categorias
function carregarCategorias() {
    const select = document.getElementById('categoria');
    select.innerHTML = '<option value="">Selecione uma categoria</option>';
    
    const transaction = db.transaction(['categorias'], 'readonly');
    const store = transaction.objectStore('categorias');
    
    store.getAll().onsuccess = (event) => {
        const categorias = event.target.result;
        categorias.forEach(categoria => {
            const option = document.createElement('option');
            option.value = categoria.categoria;
            option.textContent = categoria.categoria;
            select.appendChild(option);
        });
        
        // Atualizar lista no modal
        atualizarListaCategorias();
    };
}

function adicionarCategoria() {
    const nome = document.getElementById('nova-categoria').value.trim();
    if (!nome) return;
    
    const transaction = db.transaction(['categorias'], 'readwrite');
    const store = transaction.objectStore('categorias');
    
    store.add({ categoria: nome });
    
    transaction.oncomplete = () => {
        document.getElementById('nova-categoria').value = '';
        carregarCategorias();
    };
}

function removerCategoria() {
    const select = document.getElementById('categoria');
    const categoria = select.value;
    if (!categoria) return;
    
    const transaction = db.transaction(['categorias'], 'readwrite');
    const store = transaction.objectStore('categorias');
    const index = store.index('categoria');
    
    index.get(categoria).onsuccess = (event) => {
        store.delete(event.target.result.id);
    };
    
    transaction.oncomplete = () => {
        carregarCategorias();
    };
}

// Funções do modal
function abrirModalCategorias() {
    document.getElementById('modal-categorias').style.display = 'block';
    atualizarListaCategorias();
}

function fecharModalCategorias() {
    document.getElementById('modal-categorias').style.display = 'none';
}

function atualizarListaCategorias() {
    const lista = document.getElementById('categorias-lista');
    lista.innerHTML = '';
    
    const transaction = db.transaction(['categorias'], 'readonly');
    const store = transaction.objectStore('categorias');
    
    store.getAll().onsuccess = (event) => {
        const categorias = event.target.result;
        categorias.forEach(categoria => {
            const div = document.createElement('div');
            div.textContent = categoria.categoria;
            div.classList.add('categoria-item');
            lista.appendChild(div);
        });
    };
}

// Funções de gráficos
function atualizarGrafico() {
    const tipo = localStorage.getItem('ultimoGrafico') || 'despesas';
    plotarGrafico(tipo);
}

function plotarGrafico(tipo) {
    const mes = parseInt(document.getElementById('mes-grafico').value);
    const ano = parseInt(document.getElementById('ano-grafico').value);
    
    // Destruir gráfico anterior se existir
    const canvas = document.getElementById('grafico');
    if (canvas) {
        const existingChart = Chart.getChart(canvas);
        if (existingChart) {
            existingChart.destroy();
        }
    }
    
    // Limpar canvas
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Salvar o último tipo de gráfico
    localStorage.setItem('ultimoGrafico', tipo);
    
    if (tipo === 'despesas') {
        plotarDespesasPorCategoria(mes, ano);
    } else {
        plotarEvolucaoMensal(ano);
    }
}

function plotarDespesasPorCategoria(mes, ano) {
    console.log('Plotando gráfico de despesas para:', mes, ano);
    
    // Buscar transações do mês selecionado
    const dataInicio = new Date(ano, mes - 1, 1).toISOString();
    const dataFim = new Date(ano, mes, 0).toISOString();
    
    const transaction = db.transaction(['transacoes'], 'readonly');
    const store = transaction.objectStore('transacoes');
    const index = store.index('data');
    
    const request = index.getAll(IDBKeyRange.bound(dataInicio, dataFim));
    
    request.onsuccess = (event) => {
        const transacoes = event.target.result;
        console.log('Transações encontradas:', transacoes.length);
        
        // Filtrar apenas despesas
        const despesas = transacoes.filter(t => t.tipo === 'Despesa');
        console.log('Despesas encontradas:', despesas.length);
        
        // Verificar se há despesas
        if (despesas.length === 0) {
            alert('Nenhuma despesa encontrada para o período selecionado');
            return;
        }
        
        // Agrupar por categoria
        const categorias = {};
        despesas.forEach(transacao => {
            if (!categorias[transacao.categoria]) {
                categorias[transacao.categoria] = 0;
            }
            categorias[transacao.categoria] += transacao.valor;
        });
        
        // Preparar dados para o gráfico
        const labels = Object.keys(categorias);
        const data = Object.values(categorias);
        
        // Verificar se há dados para plotar
        if (labels.length === 0 || data.length === 0) {
            alert('Não há dados para plotar o gráfico');
            return;
        }
        
        // Gerar cores aleatórias se necessário
        const cores = [];
        const coresPadrao = [
            'rgba(255, 99, 132, 0.6)',
            'rgba(54, 162, 235, 0.6)',
            'rgba(255, 206, 86, 0.6)',
            'rgba(75, 192, 192, 0.6)',
            'rgba(153, 102, 255, 0.6)',
            'rgba(255, 159, 64, 0.6)'
        ];
        
        labels.forEach((_, index) => {
            cores.push(coresPadrao[index % coresPadrao.length]);
        });
        
        // Criar gráfico
        const canvas = document.getElementById('grafico');
        const ctx = canvas.getContext('2d');
        
        new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: cores,
                    hoverOffset: 4,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 12
                        }
                    },
                    datalabels: {
                        formatter: (value, ctx) => {
                            let label = ctx.chart.data.labels[ctx.dataIndex];
                            let valor = ctx.chart.data.datasets[0].data[ctx.dataIndex];
                            return `${label}\nR$ ${valor.toFixed(2)}`;
                        },
                        color: 'white',
                        font: {
                            size: 12,
                            weight: 'bold'
                        },
                        padding: 5,
                        display: true,
                        anchor: 'center',
                        align: 'center'
                    }
                },
                tooltips: {
                    enabled: false
                }
            }
        });
        
        console.log('Gráfico criado com sucesso');
    };
    
    request.onerror = (event) => {
        console.error('Erro ao buscar transações:', event.target.error);
        alert('Erro ao carregar dados do gráfico');
    };
}

function plotarEvolucaoMensal(ano) {
    // Buscar transações do ano selecionado
    const dataInicio = new Date(ano, 0, 1).toISOString();
    const dataFim = new Date(ano, 11, 31).toISOString();
    
    const transaction = db.transaction(['transacoes'], 'readonly');
    const store = transaction.objectStore('transacoes');
    const index = store.index('data');
    
    const request = index.getAll(IDBKeyRange.bound(dataInicio, dataFim));
    
    request.onsuccess = (event) => {
        const transacoes = event.target.result;
        
        // Agrupar por mês e tipo
        const mesReceitas = Array(12).fill(0);
        const mesDespesas = Array(12).fill(0);
        
        transacoes.forEach(transacao => {
            const mes = new Date(transacao.data).getMonth();
            if (transacao.tipo === 'Receita') {
                mesReceitas[mes] += transacao.valor;
            } else {
                mesDespesas[mes] += transacao.valor;
            }
        });
        
        // Criar gráfico
        const canvas = document.getElementById('grafico');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: meses,
                datasets: [
                    {
                        label: 'Receitas',
                        data: mesReceitas,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderWidth: 1
                    },
                    {
                        label: 'Despesas',
                        data: mesDespesas,
                        backgroundColor: 'rgba(255, 99, 132, 0.6)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Evolução Mensal - ${ano}`
                    },
                    legend: {
                        position: 'bottom'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
    };
    
    request.onerror = (event) => {
        console.error('Erro ao buscar transações:', event.target.error);
        alert('Erro ao carregar dados do gráfico');
    };
}

// Array de meses para formatação
const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
