// Função para limpar o banco de dados e começar do zero
function resetDatabase() {
    if (!confirm('Tem certeza que deseja limpar todos os dados?')) {
        return;
    }

    // Fechar conexão atual
    if (db) {
        db.close();
    }

    // Abrir conexão para deletar o banco
    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
    deleteRequest.onsuccess = () => {
        console.log('Banco de dados deletado com sucesso');
        // Reabrir o banco
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            
            // Criar os stores novamente
            const transacoesStore = db.createObjectStore('transacoes', { keyPath: 'id', autoIncrement: true });
            transacoesStore.createIndex('data', 'data', { unique: false });
            transacoesStore.createIndex('tipo', 'tipo', { unique: false });
            transacoesStore.createIndex('categoria', 'categoria', { unique: false });
            
            const categoriasStore = db.createObjectStore('categorias', { keyPath: 'id', autoIncrement: true });
            categoriasStore.createIndex('categoria', 'categoria', { unique: true });
            
            const backupStore = db.createObjectStore('backup', { keyPath: 'id', autoIncrement: true });
            backupStore.createIndex('data', 'data', { unique: false });
        };
        
        request.onsuccess = () => {
            console.log('Banco de dados recriado com sucesso');
            // Reinicializar a aplicação
            inicializarAplicacao();
        };
    };
    
    deleteRequest.onerror = () => {
        console.error('Erro ao deletar banco de dados');
    };
}

// Adicionar botão para resetar o banco
const resetBtn = document.createElement('button');
resetBtn.textContent = 'Resetar Banco de Dados';
resetBtn.style.margin = '10px';
resetBtn.style.backgroundColor = '#ff4444';
resetBtn.style.color = 'white';
resetBtn.style.padding = '5px 10px';
resetBtn.onclick = resetDatabase;
document.body.appendChild(resetBtn);
