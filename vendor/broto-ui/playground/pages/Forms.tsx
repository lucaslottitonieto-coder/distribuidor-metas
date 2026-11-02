import { ChevronsDown, ChevronsUp, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogSpacer,
  Dropzone,
  Field,
  FormGrid,
  FormSection,
  Grid,
  Input,
  JsonTextarea,
  Page,
  PageHeader,
  Radio,
  SearchInput,
  Segmented,
  Select,
  Switch,
  TagInput,
  Textarea,
  toast,
} from 'broto-ui';
import { Demo } from '../Demo';

export function FormsPage() {
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [labels, setLabels] = useState(['financeiro', 'diário']);
  const [json, setJson] = useState('{\n  "agencia": "0101",\n  "reprocessar": false\n}');
  const [prio, setPrio] = useState<'high' | 'normal' | 'low'>('normal');
  const [trigger, setTrigger] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [again, setAgain] = useState(false);

  const invalid = touched && name.trim().length < 3;

  return (
    <Page>
      <PageHeader
        crumbs={[{ label: 'Componentes', href: '#/' }, { label: 'Formulários' }]}
        title="Formulários"
        description="Field liga rótulo, dica e erro ao controle automaticamente (id, aria-describedby, aria-invalid)."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            Abrir formulário em diálogo
          </Button>
        }
      />

      <Grid layout="2">
        <Demo
          title="Campos de texto"
          code={`
<Field label="Nome da fila" required hint="Letras minúsculas e hífens." error={erro}>
  <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: conciliacao-itens" />
</Field>
<Field label="valor" typeLabel="número"><Input type="number" /></Field>
<SearchInput placeholder="Buscar por referência" />`}
        >
          <div className="bt-stack">
            <Field label="Nome da fila" required hint="Letras minúsculas e hífens." error={invalid ? 'Use pelo menos 3 caracteres.' : undefined}>
              <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} placeholder="ex.: conciliacao-itens" />
            </Field>
            <FormGrid>
              <Field label="conta" typeLabel="texto" required>
                <Input defaultValue="92225" />
              </Field>
              <Field label="valor" typeLabel="número">
                <Input type="number" defaultValue="123.45" />
              </Field>
              <Field label="Runner" hint="Desabilitado">
                <Input disabled value="LINUX-RUNNER-01" readOnly />
              </Field>
              <Field label="Ambiente">
                <Select defaultValue="hml">
                  <option value="dev">Desenvolvimento</option>
                  <option value="hml">Homologação</option>
                  <option value="prd">Produção</option>
                </Select>
              </Field>
            </FormGrid>
            <SearchInput placeholder="Buscar por referência ou conteúdo" />
            <Field label="Descrição">
              <Textarea rows={3} placeholder="Contas a conciliar no portal" />
            </Field>
          </div>
        </Demo>

        <Demo
          title="Escolhas"
          code={`
<Segmented value={prio} onChange={setPrio} options={[
  { value: 'high', label: 'Alta', icon: <ChevronsUp size={14} /> },
  { value: 'normal', label: 'Normal', icon: <Minus size={14} /> },
  { value: 'low', label: 'Baixa', icon: <ChevronsDown size={14} /> },
]} />
<Switch checked={on} onCheckedChange={setOn} label="Gatilho ligado" />
<Checkbox label="Adicionar outro depois" />
<Radio name="fmt" label="CSV" />`}
        >
          <div className="bt-stack">
            <Field label="Prioridade">
              <Segmented
                aria-label="Prioridade"
                value={prio}
                onChange={setPrio}
                options={[
                  { value: 'high', label: 'Alta', icon: <ChevronsUp size={14} /> },
                  { value: 'normal', label: 'Normal', icon: <Minus size={14} /> },
                  { value: 'low', label: 'Baixa', icon: <ChevronsDown size={14} /> },
                ]}
              />
            </Field>
            <Switch checked={trigger} onCheckedChange={setTrigger} label={trigger ? 'Gatilho ligado: até 2 jobs' : 'Gatilho desligado'} />
            <Switch label="Desabilitado" disabled />
            <div className="pg-demo-row">
              <Checkbox label="Adicionar outro depois" defaultChecked />
              <Checkbox label="Parcial" indeterminate />
              <Checkbox label="Desabilitado" disabled />
            </div>
            <div className="pg-demo-row">
              <Radio name="fmt" label="CSV" defaultChecked />
              <Radio name="fmt" label="JSON" />
              <Radio name="fmt" label="XLSX" disabled />
            </div>
            <Field label="Etiquetas" hint="Enter ou vírgula para adicionar; Backspace remove a última.">
              <TagInput value={labels} onChange={setLabels} placeholder="Adicionar etiqueta" />
            </Field>
          </div>
        </Demo>
      </Grid>

      <Grid layout="2">
        <Demo title="JSON" description="Valida enquanto digita e formata com um clique" code={`<JsonTextarea value={json} onChange={setJson} expect="object" />`}>
          <Field label="Parâmetros" typeLabel="objeto JSON">
            {(id) => <JsonTextarea id={id} value={json} onChange={setJson} rows={6} />}
          </Field>
        </Demo>
        <Demo title="Upload" code={`<Dropzone accept=".csv" onFiles={([f]) => setFile(f)} hint="CSV com cabeçalho; até 5 MB" />`}>
          <Dropzone accept=".csv,text/csv" onFiles={([f]) => setFile(f ?? null)} hint="CSV com cabeçalho na primeira linha; até 5 MB">
            {file && <span className="bt-tag bt-tag-green">{file.name}</span>}
          </Dropzone>
        </Demo>
      </Grid>

      <Card title="Formulário em diálogo" subtitle="Dialog com onSubmit coloca corpo e rodapé num <form>; Enter envia">
        <p className="bt-muted">
          O botão no cabeçalho desta página abre o mesmo formulário de "Adicionar item" do console: seções, grade de duas colunas, Segmented
          e checkbox no rodapé.
        </p>
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="lg"
        title="Adicionar item"
        description="O item entra como Novo na fila conciliacao-itens."
        onSubmit={() => {
          toast.success('Item adicionado', 'Na fila conciliacao-itens.');
          if (!again) setOpen(false);
        }}
        footer={
          <>
            <Checkbox label="Adicionar outro depois" checked={again} onChange={(e) => setAgain(e.target.checked)} />
            <DialogSpacer />
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="primary" icon={<Plus size={16} />}>
              Adicionar item
            </Button>
          </>
        }
      >
        <FormGrid>
          <FormSection>Conteúdo</FormSection>
          <Field label={<span className="bt-mono">conta</span>} typeLabel="texto" required>
            <Input defaultValue="92225" data-autofocus />
          </Field>
          <Field label={<span className="bt-mono">valor</span>} typeLabel="número">
            <Input type="number" defaultValue="123.45" />
          </Field>
          <FormSection>Controle</FormSection>
          <Field label="Referência" hint="Identificador de negócio, opcional.">
            <Input className="bt-mono" defaultValue="conta-ui-56cf9d" />
          </Field>
          <Field label="Prioridade">
            <Segmented
              aria-label="Prioridade"
              value={prio}
              onChange={setPrio}
              options={[
                { value: 'high', label: 'Alta', icon: <ChevronsUp size={14} /> },
                { value: 'normal', label: 'Normal', icon: <Minus size={14} /> },
                { value: 'low', label: 'Baixa', icon: <ChevronsDown size={14} /> },
              ]}
            />
          </Field>
          <Field label="Prazo" hint="Vazio usa o SLA da fila (240 min).">
            <Input type="datetime-local" />
          </Field>
          <Field label="Adiar até" hint="O item só fica disponível a partir deste horário.">
            <Input type="datetime-local" />
          </Field>
        </FormGrid>
      </Dialog>
    </Page>
  );
}
