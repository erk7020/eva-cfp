import sys
from PySide6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                           QHBoxLayout, QPushButton, QLabel, QLineEdit,
                           QComboBox, QTableWidget, QTableWidgetItem, QMessageBox,
                           QTabWidget, QDialog, QCalendarWidget, QSpinBox)
from PySide6.QtCore import Qt, QDate
import sqlite3
from datetime import datetime
import matplotlib.pyplot as plt
from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
from matplotlib.figure import Figure
import pandas as pd
import numpy as np

class GerenciarCategoriasDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Gerenciar Categorias")
        self.setGeometry(200, 200, 400, 300)
        
        layout = QVBoxLayout(self)
        
        # Lista de categorias
        self.lista_categorias = QTableWidget()
        self.lista_categorias.setColumnCount(1)
        self.lista_categorias.setHorizontalHeaderLabels(["Categoria"])
        layout.addWidget(self.lista_categorias)
        
        # Área de adicionar categoria
        form_layout = QHBoxLayout()
        self.nova_categoria = QLineEdit()
        self.nova_categoria.setPlaceholderText("Nova categoria")
        form_layout.addWidget(self.nova_categoria)
        
        btn_adicionar = QPushButton("Adicionar")
        btn_adicionar.clicked.connect(self.adicionar_categoria)
        form_layout.addWidget(btn_adicionar)
        
        btn_remover = QPushButton("Remover")
        btn_remover.clicked.connect(self.remover_categoria)
        form_layout.addWidget(btn_remover)
        
        layout.addLayout(form_layout)
        
        # Carregar categorias
        self.carregar_categorias()
        
    def carregar_categorias(self):
        conn = sqlite3.connect('financas.db')
        cursor = conn.cursor()
        cursor.execute('SELECT DISTINCT categoria FROM categorias ORDER BY categoria')
        categorias = cursor.fetchall()
        conn.close()
        
        self.lista_categorias.setRowCount(len(categorias))
        for i, categoria in enumerate(categorias):
            self.lista_categorias.setItem(i, 0, QTableWidgetItem(categoria[0]))
            
    def adicionar_categoria(self):
        nova_categoria = self.nova_categoria.text().strip()
        if nova_categoria:
            conn = sqlite3.connect('financas.db')
            cursor = conn.cursor()
            cursor.execute('INSERT INTO categorias (categoria) VALUES (?)', (nova_categoria,))
            conn.commit()
            conn.close()
            self.carregar_categorias()
            self.nova_categoria.clear()
            
    def remover_categoria(self):
        current_row = self.lista_categorias.currentRow()
        if current_row >= 0:
            categoria = self.lista_categorias.item(current_row, 0).text()
            conn = sqlite3.connect('financas.db')
            cursor = conn.cursor()
            cursor.execute('DELETE FROM categorias WHERE categoria = ?', (categoria,))
            conn.commit()
            conn.close()
            self.carregar_categorias()

class GraficosWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        
        # Filtro de mês
        filtro_layout = QHBoxLayout()
        self.mes_combo = QComboBox()
        meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
        self.mes_combo.addItems(meses)
        self.mes_combo.currentIndexChanged.connect(self.atualizar_graficos)
        filtro_layout.addWidget(QLabel("Mês:"))
        filtro_layout.addWidget(self.mes_combo)
        
        self.ano_spin = QSpinBox()
        self.ano_spin.setRange(2000, 2100)
        self.ano_spin.setValue(datetime.now().year)
        self.ano_spin.valueChanged.connect(self.atualizar_graficos)
        filtro_layout.addWidget(QLabel("Ano:"))
        filtro_layout.addWidget(self.ano_spin)
        
        # Botões para diferentes tipos de gráficos
        btn_layout = QHBoxLayout()
        self.btn_despesas = QPushButton("Despesas por Categoria")
        self.btn_despesas.clicked.connect(self.plotar_despesas_categoria)
        btn_layout.addWidget(self.btn_despesas)
        
        self.btn_evolucao = QPushButton("Evolução Mensal")
        self.btn_evolucao.clicked.connect(self.plotar_evolucao_mensal)
        btn_layout.addWidget(self.btn_evolucao)
        
        layout.addLayout(filtro_layout)
        layout.addLayout(btn_layout)
        
        # Criar figura do matplotlib
        self.figure = Figure(figsize=(8, 6))
        self.canvas = FigureCanvas(self.figure)
        layout.addWidget(self.canvas)
        
    def atualizar_graficos(self):
        if hasattr(self, 'ultimo_grafico'):
            if self.ultimo_grafico == 'despesas':
                self.plotar_despesas_categoria()
            elif self.ultimo_grafico == 'evolucao':
                self.plotar_evolucao_mensal()
        
    def plotar_despesas_categoria(self):
        self.ultimo_grafico = 'despesas'
        mes = self.mes_combo.currentIndex() + 1
        ano = self.ano_spin.value()
        
        conn = sqlite3.connect('financas.db')
        df = pd.read_sql_query('''
            SELECT categoria, SUM(valor) as total
            FROM transacoes
            WHERE tipo = 'Despesa'
            AND strftime('%m', data) = ?
            AND strftime('%Y', data) = ?
            GROUP BY categoria
        ''', conn, params=(f"{mes:02d}", str(ano)))
        conn.close()
        
        self.figure.clear()
        ax = self.figure.add_subplot(111)
        if not df.empty:
            def func(pct, allvals):
                valor = pct/100.*np.sum(allvals)
                return f'{pct:.1f}%\nR$ {valor:.2f}'

            wedges, texts, autotexts = ax.pie(
                df['total'],
                labels=df['categoria'],
                autopct=lambda pct: func(pct, df['total']),
                textprops=dict(color="black", fontsize=10, fontweight='bold'),
                pctdistance=0.7,
                labeldistance=1.1
            )
            ax.set_title(f'Despesas por Categoria - {self.mes_combo.currentText()}/{ano}')
        else:
            ax.text(0.5, 0.5, 'Sem dados para o período selecionado',
                    horizontalalignment='center', verticalalignment='center')
        self.canvas.draw()
        
    def plotar_evolucao_mensal(self):
        self.ultimo_grafico = 'evolucao'
        ano = self.ano_spin.value()
        meses_numeros = [f"{i:02d}" for i in range(1, 13)]
        meses_labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
                        'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
        conn = sqlite3.connect('financas.db')
        df = pd.read_sql_query('''
            SELECT 
                strftime('%m', data) as mes,
                SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END) as receitas,
                SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END) as despesas
            FROM transacoes
            WHERE strftime('%Y', data) = ?
            GROUP BY mes
            ORDER BY mes
        ''', conn, params=(str(ano),))
        conn.close()
        receitas = []
        despesas = []
        saldo = []
        saldo_acumulado = 0
        for i, mes in enumerate(meses_numeros):
            row = df[df['mes'] == mes]
            receita_mes = float(row['receitas'].values[0]) if not row.empty else 0
            despesa_mes = float(row['despesas'].values[0]) if not row.empty else 0
            receitas.append(receita_mes)
            despesas.append(despesa_mes)
            saldo_acumulado += receita_mes - despesa_mes
            saldo.append(saldo_acumulado)
        self.figure.clear()
        ax = self.figure.add_subplot(111)
        if any(receitas) or any(despesas):
            x = range(12)
            width = 0.35
            # Calculate monthly balances
            monthly_balances = [r - d for r, d in zip(receitas, despesas)]

            # Plot bars
            rects1 = ax.bar([i - width/2 for i in x], receitas, width=width, label='Receitas', color='darkgrey')
            rects2 = ax.bar([i + width/2 for i in x], despesas, width=width, label='Despesas', color='lightgrey')

            # Add value labels on top of bars
            def autolabel(rects, values):
                for i, rect in enumerate(rects):
                    height = rect.get_height()
                    if height > 0:
                         ax.text(rect.get_x() + rect.get_width()/2., height + 50,  # Ajuste o 50 conforme necessário para o espaçamento
                                f'{values[i]:.0f}',
                                ha='center', va='bottom', fontsize=9)

            autolabel(rects1, receitas)
            autolabel(rects2, despesas)

            # Create custom x-axis labels with month and monthly balance
            custom_xticks = []
            for i in range(12):
                month_label = meses_labels[i]
                balance_label = f'R$ {monthly_balances[i]:.0f}' # Formato sem centavos e sem cor
                custom_xticks.append(f'{month_label}\n{balance_label}')

            ax.set_title(f'Evolução Mensal - {ano}')
            ax.set_xlabel('Mês')
            ax.set_ylabel('Valor (R$)')
            ax.set_xticks(x)
            ax.set_xticklabels(custom_xticks, fontsize=9)

            # Remove the twinx axis if it exists (from previous code)
            if hasattr(ax, 'twinx'):
                 # Check if there's a second axis object associated
                 if len(self.figure.axes) > 1:
                    # Assuming ax2 is the second axis, remove it
                    # A more robust way might involve checking the type or label if available
                    if self.figure.axes[1] != ax:
                        self.figure.delaxes(self.figure.axes[1])

            #lines1, labels1 = ax.get_legend_handles_labels()
            #ax.legend(lines1, labels1, loc='upper left') # Remove the second legend handle
            ax.legend(loc='upper right') # Use upper right as in the image example

            ax.grid(axis='y', linestyle='--', alpha=0.7) # Keep only horizontal grid lines
            ax.set_ylim(0, max(max(receitas), max(despesas)) * 1.2) # Adjust y-limit for labels

        else:
            ax.text(0.5, 0.5, 'Sem dados para o período selecionado',
                    horizontalalignment='center', verticalalignment='center')
        self.figure.tight_layout()
        self.canvas.draw()

class ControleFinanceiro(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("EVA CFP")
        self.setGeometry(100, 100, 1000, 800)
        
        # Inicializa o banco de dados
        self.inicializar_banco()
        
        # Widget central com abas
        self.central_widget = QTabWidget()
        self.setCentralWidget(self.central_widget)
        
        # Aba de transações
        self.tab_transacoes = QWidget()
        self.central_widget.addTab(self.tab_transacoes, "Transações")
        
        # Aba de gráficos
        self.tab_graficos = GraficosWidget()
        self.central_widget.addTab(self.tab_graficos, "Gráficos")
        
        self.central_widget.currentChanged.connect(self.atualizar_aba_graficos)
        
        # Layout da aba de transações
        layout = QVBoxLayout(self.tab_transacoes)
        
        # Filtro de mês
        filtro_layout = QHBoxLayout()
        self.mes_combo = QComboBox()
        meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
        self.mes_combo.addItems(meses)
        self.mes_combo.setCurrentIndex(datetime.now().month - 1)
        self.mes_combo.currentIndexChanged.connect(self.filtrar_por_mes)
        filtro_layout.addWidget(QLabel("Mês:"))
        filtro_layout.addWidget(self.mes_combo)
        
        self.ano_spin = QSpinBox()
        self.ano_spin.setRange(2000, 2100)
        self.ano_spin.setValue(datetime.now().year)
        self.ano_spin.valueChanged.connect(self.filtrar_por_mes)
        filtro_layout.addWidget(QLabel("Ano:"))
        filtro_layout.addWidget(self.ano_spin)
        
        layout.addLayout(filtro_layout)
        
        # Área de entrada de dados
        form_layout = QHBoxLayout()
        
        # Tipo de transação
        self.tipo_combo = QComboBox()
        self.tipo_combo.addItems(["Receita", "Despesa"])
        form_layout.addWidget(QLabel("Tipo:"))
        form_layout.addWidget(self.tipo_combo)
        
        # Valor
        self.valor_input = QLineEdit()
        self.valor_input.setPlaceholderText("Valor")
        form_layout.addWidget(QLabel("Valor:"))
        form_layout.addWidget(self.valor_input)
        
        # Descrição
        self.descricao_input = QLineEdit()
        self.descricao_input.setPlaceholderText("Descrição")
        form_layout.addWidget(QLabel("Descrição:"))
        form_layout.addWidget(self.descricao_input)
        
        # Categoria
        self.categoria_combo = QComboBox()
        self.atualizar_categorias()
        form_layout.addWidget(QLabel("Categoria:"))
        form_layout.addWidget(self.categoria_combo)
        
        # Botão de gerenciar categorias
        btn_gerenciar_categorias = QPushButton("Gerenciar Categorias")
        btn_gerenciar_categorias.clicked.connect(self.gerenciar_categorias)
        form_layout.addWidget(btn_gerenciar_categorias)
        
        # Botão de adicionar
        btn_adicionar = QPushButton("Adicionar")
        btn_adicionar.clicked.connect(self.adicionar_transacao)
        form_layout.addWidget(btn_adicionar)
        
        layout.addLayout(form_layout)
        
        # Tabela de transações
        self.tabela = QTableWidget()
        self.tabela.setColumnCount(5)
        self.tabela.setHorizontalHeaderLabels(["Data", "Tipo", "Valor", "Descrição", "Categoria"])
        layout.addWidget(self.tabela)

        # Conectar duplo clique para remover transação
        self.tabela.itemDoubleClicked.connect(self.remover_transacao_duplo_clique)

        # Área de saldo
        saldo_layout = QHBoxLayout()
        self.label_saldo = QLabel("Saldo: R$ 0,00")
        saldo_layout.addWidget(self.label_saldo)
        layout.addLayout(saldo_layout)
        
        # Carrega as transações
        self.carregar_transacoes()
        
    def inicializar_banco(self):
        conn = sqlite3.connect('financas.db')
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS transacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                data TEXT,
                tipo TEXT,
                valor REAL,
                descricao TEXT,
                categoria TEXT
            )
        ''')
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS categorias (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                categoria TEXT UNIQUE
            )
        ''')
        # Inserir categorias padrão se não existirem
        categorias_padrao = ["Alimentação", "Transporte", "Moradia", "Lazer", "Outros"]
        for categoria in categorias_padrao:
            cursor.execute('INSERT OR IGNORE INTO categorias (categoria) VALUES (?)', (categoria,))
        conn.commit()
        conn.close()
        
    def atualizar_categorias(self):
        self.categoria_combo.clear()
        conn = sqlite3.connect('financas.db')
        cursor = conn.cursor()
        cursor.execute('SELECT categoria FROM categorias ORDER BY categoria')
        categorias = cursor.fetchall()
        conn.close()
        self.categoria_combo.addItems([cat[0] for cat in categorias])
        
    def gerenciar_categorias(self):
        dialog = GerenciarCategoriasDialog(self)
        dialog.exec_()
        self.atualizar_categorias()
        
    def filtrar_por_mes(self):
        mes = self.mes_combo.currentIndex() + 1
        ano = self.ano_spin.value()
        self.carregar_transacoes(mes, ano)
        
    def adicionar_transacao(self):
        try:
            valor = float(self.valor_input.text().replace(',', '.'))
            descricao = self.descricao_input.text()
            tipo = self.tipo_combo.currentText()
            categoria = self.categoria_combo.currentText()
            
            if not descricao:
                QMessageBox.warning(self, "Erro", "Por favor, preencha a descrição!")
                return
                
            conn = sqlite3.connect('financas.db')
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO transacoes (data, tipo, valor, descricao, categoria)
                VALUES (?, ?, ?, ?, ?)
            ''', (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), tipo, valor, descricao, categoria))
            conn.commit()
            conn.close()
            
            self.carregar_transacoes()
            self.limpar_campos()
            
        except ValueError:
            QMessageBox.warning(self, "Erro", "Por favor, insira um valor válido!")
            
    def carregar_transacoes(self, mes=None, ano=None):
        conn = sqlite3.connect('financas.db')
        cursor = conn.cursor()
        
        if mes is not None and ano is not None:
            cursor.execute('''
                SELECT data, tipo, valor, descricao, categoria 
                FROM transacoes 
                WHERE strftime('%m', data) = ? AND strftime('%Y', data) = ?
                ORDER BY data DESC
            ''', (f"{mes:02d}", str(ano)))
        else:
            cursor.execute('SELECT data, tipo, valor, descricao, categoria FROM transacoes ORDER BY data DESC')
            
        transacoes = cursor.fetchall()
        conn.close()
        
        self.tabela.setRowCount(len(transacoes))
        saldo = 0
        
        for i, transacao in enumerate(transacoes):
            for j, valor in enumerate(transacao):
                if j == 2:  # Coluna de valor
                    if transacao[1] == "Receita":
                        saldo += valor
                    else:
                        saldo -= valor
                    self.tabela.setItem(i, j, QTableWidgetItem(f"R$ {valor:.2f}"))
                else:
                    self.tabela.setItem(i, j, QTableWidgetItem(str(valor)))
                    
        self.label_saldo.setText(f"Saldo: R$ {saldo:.2f}")
        
    def limpar_campos(self):
        self.valor_input.clear()
        self.descricao_input.clear()
        self.tipo_combo.setCurrentIndex(0)
        self.categoria_combo.setCurrentIndex(0)

    def remover_transacao(self):
        row = self.tabela.currentRow()
        if row >= 0:
            reply = QMessageBox.question(self, 'Remover Transação',
                                         'Tem certeza que deseja remover a transação selecionada?',
                                         QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
            if reply == QMessageBox.Yes:
                data = self.tabela.item(row, 0).text()
                tipo = self.tabela.item(row, 1).text()
                valor = float(self.tabela.item(row, 2).text().replace('R$','').replace(',','.'))
                descricao = self.tabela.item(row, 3).text()
                categoria = self.tabela.item(row, 4).text()
                conn = sqlite3.connect('financas.db')
                cursor = conn.cursor()
                cursor.execute('''DELETE FROM transacoes WHERE data=? AND tipo=? AND valor=? AND descricao=? AND categoria=?''',
                               (data, tipo, valor, descricao, categoria))
                conn.commit()
                conn.close()
                self.carregar_transacoes()

    def remover_transacao_duplo_clique(self, item):
        row = item.row()
        if row >= 0:
            reply = QMessageBox.question(self, 'Remover Transação',
                                         'Tem certeza que deseja remover a transação selecionada?',
                                         QMessageBox.Yes | QMessageBox.No, QMessageBox.No)
            if reply == QMessageBox.Yes:
                data = self.tabela.item(row, 0).text()
                tipo = self.tabela.item(row, 1).text()
                valor = float(self.tabela.item(row, 2).text().replace('R$','').replace(',','.'))
                descricao = self.tabela.item(row, 3).text()
                categoria = self.tabela.item(row, 4).text()
                conn = sqlite3.connect('financas.db')
                cursor = conn.cursor()
                cursor.execute('''DELETE FROM transacoes WHERE data=? AND tipo=? AND valor=? AND descricao=? AND categoria=?''',
                               (data, tipo, valor, descricao, categoria))
                conn.commit()
                conn.close()
                self.carregar_transacoes()

    def atualizar_aba_graficos(self, index):
        # Se a aba de gráficos for selecionada, atualiza para mês/ano atual e plota o gráfico
        if self.central_widget.tabText(index) == "Gráficos":
            mes_atual = datetime.now().month - 1
            ano_atual = datetime.now().year
            self.tab_graficos.mes_combo.setCurrentIndex(mes_atual)
            self.tab_graficos.ano_spin.setValue(ano_atual)
            self.tab_graficos.plotar_despesas_categoria()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = ControleFinanceiro()
    window.show()
    sys.exit(app.exec_()) 