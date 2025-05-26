// Configuração do GitHub API
const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_REPO = 'erk7020/eva-cfp';
const GITHUB_TOKEN = localStorage.getItem('github_token'); // Token será salvo após login

// Inicialização do IndexedDB
const DB_NAME = 'EVA_CFP';
const DB_VERSION = 2;
let db;
let usuarioLogado = null;

// Abre a conexão com o banco de dados
const request = indexedDB.open(DB_NAME, DB_VERSION);

request.onerror = (event) => {
    console.error('Erro ao abrir o banco de dados');
};

request.onsuccess = (event) => {
    db = event.target.result;
    inicializarAplicacao();
    // Carregar backup inicial se existir
    carregarBackup();
    // Verificar se usuário está logado
    verificarLogin();
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
    
    // Criação do objeto store para backup
    const backupStore = db.createObjectStore('backup', { keyPath: 'id', autoIncrement: true });
    backupStore.createIndex('data', 'data', { unique: false });
    
    // Criação do objeto store para usuários
    const usuariosStore = db.createObjectStore('usuarios', { keyPath: 'id', autoIncrement: true });
    usuariosStore.createIndex('email', 'email', { unique: true });
    usuariosStore.createIndex('githubId', 'githubId', { unique: true });
};

// Função para carregar backup inicial
function carregarBackup() {
    // Primeiro tentar carregar do GitHub
    carregarDadosGitHub();
    
    // Se falhar, usar backup local
    const transaction = db.transaction(['backup'], 'readonly');
    const backupStore = transaction.objectStore('backup');
    
    const request = backupStore.getAll();
    request.onsuccess = (event) => {
        const backups = event.target.result;
        if (backups.length > 0) {
            const dados = backups[0].dados;
            
            // Limpar dados atuais
            const transaction = db.transaction(['transacoes', 'categorias'], 'readwrite');
            const transacoesStore = transaction.objectStore('transacoes');
            const categoriasStore = transaction.objectStore('categorias');
            
            // Limpar dados atuais
            transacoesStore.clear();
            categoriasStore.clear();
            
            // Adicionar dados do backup
            dados.transacoes.forEach(transacao => {
                transacoesStore.add(transacao);
            });
            
            dados.categorias.forEach(categoria => {
                categoriasStore.add(categoria);
            });
            
            // Recarregar dados
            carregarTransacoes();
            carregarCategorias();
            calcularSaldoCumulativoTotal();
        }
    };
}

// Função para verificar login
function verificarLogin() {
    if (GITHUB_TOKEN) {
        // Usuário já está logado
        usuarioLogado = JSON.parse(localStorage.getItem('usuario_logado'));
        if (usuarioLogado) {
            // Carregar dados do GitHub
            carregarDadosGitHub();
        }
    } else {
        // Mostrar modal de login
        abrirModalLogin();
    }
}

// Função para abrir modal de login
function abrirModalLogin() {
    // Criar modal de login
    const modal = document.createElement('div');
    modal.className = 'modal-login';
    modal.innerHTML = `
        <div class="modal-login-content">
            <h2>Login com GitHub</h2>
            <p>Por favor, faça login com sua conta do GitHub para acessar seus dados.</p>
            <button id="btn-login-github">Login com GitHub</button>
            <button id="btn-cancelar-login">Cancelar</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Configurar eventos do modal
    document.getElementById('btn-login-github').addEventListener('click', () => {
        // Redirecionar para login do GitHub
        const authUrl = `https://github.com/login/oauth/authorize?client_id=SEU_CLIENT_ID&redirect_uri=SEU_REDIRECT_URI&scope=read:user`;
        window.location.href = authUrl;
    });
    
    document.getElementById('btn-cancelar-login').addEventListener('click', () => {
        modal.remove();
    });
}

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
    
    // Eventos de exportação/importação
    document.getElementById('btn-exportar-dados').addEventListener('click', exportarDados);
    document.getElementById('btn-importar-dados').addEventListener('click', importarDados);
    
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
        // Ao adicionar transação, recarregar transações do mês atual e recalcular saldo cumulativo total
        carregarTransacoes();
        calcularSaldoCumulativoTotal();
        // Atualizar backup
        gerenciarBackup();
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
    const btn = event.target;
    const id = btn.dataset.id;
    
    if (!confirm('Tem certeza que deseja remover esta transação?')) {
        return;
    }
    
    const transaction = db.transaction(['transacoes'], 'readwrite');
    const store = transaction.objectStore('transacoes');
    store.delete(parseInt(id));
    
    transaction.oncomplete = () => {
        carregarTransacoes();
        calcularSaldoCumulativoTotal();
        // Atualizar backup
        gerenciarBackup();
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
    const nomeCategoria = document.getElementById('nova-categoria').value.trim();
    
    if (!nomeCategoria) {
        alert('Por favor, digite um nome para a categoria');
        return;
    }
    
    const transaction = db.transaction(['categorias'], 'readwrite');
    const store = transaction.objectStore('categorias');
    
    const categoria = {
        categoria: nomeCategoria
    };
    
    store.add(categoria);
    
    transaction.oncomplete = () => {
        atualizarListaCategorias();
        atualizarSelectCategorias();
        // Atualizar backup
        gerenciarBackup();
    };
}

function removerCategoria() {
    const select = document.getElementById('categorias-lista');
    const categoriaSelecionada = select.value;
    
    if (!categoriaSelecionada) {
        alert('Selecione uma categoria para remover');
        return;
    }
    
    if (!confirm('Tem certeza que deseja remover esta categoria?')) {
        return;
    }
    
    const transaction = db.transaction(['categorias'], 'readwrite');
    const store = transaction.objectStore('categorias');
    const index = store.index('categoria');
    
    index.get(categoriaSelecionada).onsuccess = (event) => {
        const categoria = event.target.result;
        if (categoria) {
            store.delete(categoria.id);
            
            transaction.oncomplete = () => {
                atualizarListaCategorias();
                // Atualizar backup
                gerenciarBackup();
            };
        }
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

// Função para atualizar o select de categorias
function atualizarSelectCategorias() {
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

    // Remover a tabela de saldo acumulado mês a mês se existir
    const tabelaSaldoMensal = document.getElementById('tabela-saldo');
    if (tabelaSaldoMensal) {
        tabelaSaldoMensal.remove();
    }

    // Remover o saldo cumulativo total se existir antes de decidir se exibe
    const saldoTotalElement = document.getElementById('saldo-total-anual');
    if (saldoTotalElement) {
        saldoTotalElement.remove();
    }
    
    if (tipo === 'despesas') {
        plotarDespesasPorCategoria(mes, ano);
    } else if (tipo === 'evolucao') {
        plotarEvolucaoMensal(ano);
        // Calcular e exibir o saldo cumulativo total APÓS plotar o gráfico de evolução
        calcularSaldoCumulativoTotal();
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
                        display: false,
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

// Funções de exportação/importação
function exportarDados() {
    // Primeiro tentar obter dados do IndexedDB
    const transaction = db.transaction(['backup'], 'readonly');
    const backupStore = transaction.objectStore('backup');
    
    const request = backupStore.getAll();
    request.onsuccess = (event) => {
        const backups = event.target.result;
        if (backups.length > 0) {
            const dados = backups[0].dados; // Pega os dados do último backup
            
            // Gerar nome do arquivo com data atual
            const hoje = new Date();
            const ano = hoje.getFullYear();
            const mes = String(hoje.getMonth() + 1).padStart(2, '0');
            const dia = String(hoje.getDate()).padStart(2, '0');
            const nomeArquivo = `cfp-dados-${ano}-${mes}-${dia}.json`;
            
            // Criar blob e gerar link para download
            const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nomeArquivo;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } else {
            // Se não houver backup no IndexedDB, tentar usar localStorage
            const dados = JSON.parse(localStorage.getItem('cfp_backup') || '{}');
            
            if (!dados.transacoes || !dados.categorias) {
                alert('Nenhum backup encontrado. Por favor, faça uma alteração no sistema para gerar um backup.');
                return;
            }
            
            // Gerar nome do arquivo com data atual
            const hoje = new Date();
            const ano = hoje.getFullYear();
            const mes = String(hoje.getMonth() + 1).padStart(2, '0');
            const dia = String(hoje.getDate()).padStart(2, '0');
            const nomeArquivo = `cfp-dados-${ano}-${mes}-${dia}.json`;
            
            // Criar blob e gerar link para download
            const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = nomeArquivo;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }
    };
}

function importarDados() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            const content = await file.text();
            const dados = JSON.parse(content);
            
            if (!dados.transacoes || !dados.categorias) {
                throw new Error('O arquivo não está no formato correto');
            }
            
            // Confirmar importação
            if (!confirm('Tem certeza que deseja importar os dados? Isso irá sobrescrever os dados atuais.')) {
                return;
            }
            
            // Limpar dados atuais
            const transaction = db.transaction(['transacoes', 'categorias'], 'readwrite');
            const transacoesStore = transaction.objectStore('transacoes');
            const categoriasStore = transaction.objectStore('categorias');
            
            // Limpar dados atuais
            await transacoesStore.clear();
            await categoriasStore.clear();
            
            // Adicionar novos dados
            dados.transacoes.forEach(transacao => {
                transacoesStore.add(transacao);
            });
            
            dados.categorias.forEach(categoria => {
                categoriasStore.add(categoria);
            });
            
            // Recarregar dados
            carregarTransacoes();
            carregarCategorias();
            calcularSaldoCumulativoTotal();
            
            // Atualizar backup
            gerenciarBackup();
            
            alert('Dados importados com sucesso!');
        } catch (error) {
            alert('Erro ao importar dados: ' + error.message);
        }
    };
    
    input.click();
}

// Função para gerenciar backup automático
function gerenciarBackup() {
    // Criar uma nova transação para ler os dados
    const transaction = db.transaction(['transacoes', 'categorias'], 'readonly');
    const transacoesStore = transaction.objectStore('transacoes');
    const categoriasStore = transaction.objectStore('categorias');
    
    const dados = {
        transacoes: [],
        categorias: []
    };
    
    transacoesStore.getAll().onsuccess = (event) => {
        dados.transacoes = event.target.result;
        categoriasStore.getAll().onsuccess = (event) => {
            dados.categorias = event.target.result;
            
            // Salvar no localStorage para cache temporário
            localStorage.setItem('cfp_backup', JSON.stringify(dados));
            
            // Salvar no IndexedDB para backup persistente
            const backupTransaction = db.transaction(['backup'], 'readwrite');
            const backupStore = backupTransaction.objectStore('backup');
            
            // Remover backup antigo
            backupStore.clear();
            
            // Adicionar novo backup
            const backup = {
                dados: dados,
                data: new Date().toISOString()
            };
            
            backupStore.add(backup);
            
            // Se usuário está logado, salvar no GitHub
            if (usuarioLogado) {
                salvarNoGitHub(dados);
            }
        };
    };
}

// Função para salvar dados no GitHub
async function salvarNoGitHub(dados) {
    try {
        const headers = {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json'
        };
        
        // Converter dados para string
        const dadosString = JSON.stringify(dados);
        const blob = new Blob([dadosString], { type: 'application/json' });
        const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
        
        // Criar ou atualizar arquivo no GitHub
        const response = await fetch(`${GITHUB_API_URL}/repos/${GITHUB_REPO}/contents/dados/${usuarioLogado.githubId}.json`, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({
                message: `Atualizando dados do usuário ${usuarioLogado.githubId}`,
                content: base64.split(',')[1],
                branch: 'main'
            })
        });
        
        if (!response.ok) {
            throw new Error('Erro ao salvar dados no GitHub');
        }
        
        console.log('Dados salvos com sucesso no GitHub');
    } catch (error) {
        console.error('Erro ao salvar dados no GitHub:', error);
    }
}

// Função para carregar dados do GitHub
async function carregarDadosGitHub() {
    if (!usuarioLogado) return;
    
    try {
        const headers = {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json'
        };
        
        const response = await fetch(`${GITHUB_API_URL}/repos/${GITHUB_REPO}/contents/dados/${usuarioLogado.githubId}.json`, {
            headers: headers
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar dados do GitHub');
        }
        
        const data = await response.json();
        const base64Content = data.content;
        const dados = JSON.parse(atob(base64Content));
        
        // Limpar dados atuais
        const transaction = db.transaction(['transacoes', 'categorias'], 'readwrite');
        const transacoesStore = transaction.objectStore('transacoes');
        const categoriasStore = transaction.objectStore('categorias');
        
        transacoesStore.clear();
        categoriasStore.clear();
        
        // Adicionar novos dados
        dados.transacoes.forEach(transacao => {
            transacoesStore.add(transacao);
        });
        
        dados.categorias.forEach(categoria => {
            categoriasStore.add(categoria);
        });
        
        // Atualizar backup local
        gerenciarBackup();
        
        alert('Dados carregados com sucesso do GitHub!');
    } catch (error) {
        console.error('Erro ao carregar dados do GitHub:', error);
        alert('Erro ao carregar dados do GitHub. Usando backup local.');
    }
}

// Função para calcular e exibir o saldo cumulativo TOTAL do ano
function calcularSaldoCumulativoTotal() {
    const ano = parseInt(document.getElementById('ano-grafico').value); // Pega o ano do filtro de gráfico
    const dataInicio = new Date(ano, 0, 1).toISOString();
    const dataFim = new Date(ano, 11, 31, 23, 59, 59, 999).toISOString(); // Inclui até o último ms do ano

    const transaction = db.transaction(['transacoes'], 'readonly');
    const store = transaction.objectStore('transacoes');
    const index = store.index('data');

    const request = index.getAll(IDBKeyRange.bound(dataInicio, dataFim));

    request.onsuccess = (event) => {
        const todasTransacoesDoAno = event.target.result;
        let saldoTotal = 0;

        todasTransacoesDoAno.forEach(transacao => {
            if (transacao.tipo === 'Receita') {
                saldoTotal += transacao.valor;
            } else {
                saldoTotal -= transacao.valor;
            }
        });

        // Atualiza ou cria o elemento para exibir o saldo cumulativo total
        let saldoTotalElement = document.getElementById('saldo-total-anual');
        if (!saldoTotalElement) {
            const container = document.getElementById('grafico-container');
            saldoTotalElement = document.createElement('div');
            saldoTotalElement.id = 'saldo-total-anual';
            saldoTotalElement.className = 'saldo-total-anual'; // Adiciona uma classe para estilizar
            // Insere após o container do gráfico
            container.parentNode.insertBefore(saldoTotalElement, container.nextSibling);
        }

        // Altera a frase para apenas "Saldo do Ano:" e atualiza o valor
        saldoTotalElement.innerHTML = `Saldo do Ano: <span class="${saldoTotal >= 0 ? 'positivo' : 'negativo'}">R$ ${saldoTotal.toFixed(2)}</span>`;
    };

    request.onerror = (event) => {
        console.error('Erro ao buscar transações para saldo total:', event.target.error);
    };
}

// Array de meses para formatação
const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
