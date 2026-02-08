import { ExcelService } from './excel/excel.service';
import * as ExcelJS from 'exceljs';

// Mock repositories
const mockGenreRepo: any = {
    find: async () => [
        { id: '1', name: 'Rock' },
        { id: '2', name: 'Pop' },
        { id: '3', name: 'Jazz' },
        { id: '4', name: 'Metal' }
    ]
};

const mockCountryRepo: any = {
    find: async () => [
        { id: '1', name: 'USA' },
        { id: '2', name: 'Canada' },
        { id: '3', name: 'UK' },
        { id: '4', name: 'Germany' }
    ]
};

async function verifyExcelStructure() {
    console.log('Verifying Excel structure...');
    const service = new ExcelService(mockGenreRepo as any, mockCountryRepo as any);

    try {
        const buffer = await service.generateTemplate();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);

        // Check main sheet
        const ws = workbook.getWorksheet('Discos');
        if (!ws) {
            console.error('FAILURE: Discos sheet not found');
            return;
        }
        console.log('SUCCESS: Discos sheet found');

        // Check Data sheet
        const dataSheet = workbook.getWorksheet('Data');
        if (!dataSheet) {
            console.error('FAILURE: Data sheet not found');
            return;
        }
        console.log('SUCCESS: Data sheet found');

        if (dataSheet.state !== 'hidden') {
            console.error(`FAILURE: Data sheet state is ${dataSheet.state}, expected hidden`);
        } else {
            console.log('SUCCESS: Data sheet is hidden');
        }

        // Check Data Validation references
        const genreCell = ws.getCell('E2');
        const countryCell = ws.getCell('F2');

        console.log('Genre Validation:', genreCell.dataValidation?.formulae);
        console.log('Country Validation:', countryCell.dataValidation?.formulae);

        const genreFormula = genreCell.dataValidation?.formulae[0];
        const countryFormula = countryCell.dataValidation?.formulae[0];

        if (genreFormula && genreFormula.includes('Data!$B$1:$B$4')) {
            console.log('SUCCESS: Genre validation references Data sheet correctly');
        } else {
            console.error('FAILURE: Genre validation incorrect');
        }

        if (countryFormula && countryFormula.includes('Data!$A$1:$A$4')) {
            console.log('SUCCESS: Country validation references Data sheet correctly');
        } else {
            console.error('FAILURE: Country validation incorrect');
        }

    } catch (error) {
        console.error('Error verifying excel:', error);
    }
}

verifyExcelStructure();
